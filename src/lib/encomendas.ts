import { assertOperatorCanCash } from "./actor";
import { currentCashSession, money2 } from "./cash";
import { getDb } from "./db";
import { getLocation, isStore } from "./locations";
import { formatBRL, newId, todayDate } from "./money";
import { checkout, StockError } from "./stock";
import { oldestLots } from "./stock-core";
import { catalogItems } from "./queries";
import type { FifoPriceChunk, PaymentMethod, SalePayment, StockRequest, StockRequestItem, Transfer } from "./types";
import { fifoSaleTotal, isOpenRequest, PAYMENT_METHODS, saleLotPrice, storeRequestKind, transferStatus } from "./types";

export class EncomendaError extends Error {}

function asStock(err: unknown): never {
  if (err instanceof EncomendaError) throw err;
  if (err instanceof StockError) throw new EncomendaError(err.message);
  throw err;
}

function paymentsOf(total: number, input: { payment?: PaymentMethod; payments?: SalePayment[] }) {
  const raw = (input.payments ?? []).filter((row) => row.amount > 0);
  const lines = raw.length
    ? raw
    : input.payment
      ? [{ method: input.payment, amount: total }]
      : [];
  if (lines.length === 0) throw new EncomendaError("Escolha como entrou o dinheiro.");
  const byMethod: Record<PaymentMethod, number> = { dinheiro: 0, pix: 0, cartao: 0 };
  for (const row of lines) {
    if (!PAYMENT_METHODS.some((item) => item.id === row.method)) {
      throw new EncomendaError("Forma de pagamento inválida.");
    }
    byMethod[row.method] += money2(row.amount);
  }
  const payments = PAYMENT_METHODS
    .map((item) => ({ method: item.id, amount: money2(byMethod[item.id]) }))
    .filter((row) => row.amount > 0);
  const paid = money2(payments.reduce((sum, row) => sum + row.amount, 0));
  if (Math.abs(paid - money2(total)) >= 0.005) {
    throw new EncomendaError("Os pagamentos têm que somar o sinal.");
  }
  return payments;
}

export const encomendaPaymentsOf = paymentsOf;

export async function estimateEncomendaTotal(items: { nicheId: string; qty: number }[]) {
  const catalog = await catalogItems(false);
  return money2(
    items.reduce((sum, item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return sum + (found?.niche.sellPrice ?? 0) * item.qty;
    }, 0),
  );
}

export type EncomendaDeliveryQuote = {
  fifoTotal: number;
  combinedTotal: number;
  due: number;
  differs: boolean;
};

async function fifoTotalForPayload(
  locationId: string,
  payload: { nicheId: string; qty: number }[],
  requestId?: string,
) {
  const db = getDb();
  let total = 0;
  for (const item of payload) {
    if (item.qty <= 0) continue;
    const niche = await db.niches.get(item.nicheId);
    if (!niche) throw new EncomendaError("Produto não encontrado.");
    const chunks = await oldestLots(locationId, item.nicheId, item.qty, {
      skipExpired: true,
      onlyRequestId: requestId,
    });
    const priced: FifoPriceChunk[] = [];
    for (const chunk of chunks) {
      const lot = await db.lots.get(chunk.lotId);
      priced.push({
        qty: chunk.qty,
        unitPrice: saleLotPrice(lot, niche.sellPrice, niche.promoPrice ?? 0, false),
      });
    }
    total += fifoSaleTotal(priced);
  }
  return money2(total);
}

export async function quoteEncomendaDelivery(requestId: string): Promise<EncomendaDeliveryQuote> {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || storeRequestKind(request) !== "encomenda") {
    throw new EncomendaError("Só a encomenda da loja tem cotação de entrega.");
  }
  const items = await db.requestItems.where("requestId").equals(requestId).toArray();
  const payload = items
    .filter((item) => (item.sentQty ?? 0) > 0)
    .map((item) => ({ nicheId: item.nicheId, qty: item.sentQty ?? 0 }));
  const fifoTotal = payload.length ? await fifoTotalForPayload(request.fromLocationId, payload, requestId) : 0;
  const combinedTotal = money2(request.estimatedTotal ?? 0);
  const credit = money2(request.signalAmount ?? 0);
  const due = money2(combinedTotal - credit);
  return {
    fifoTotal,
    combinedTotal,
    due,
    differs: combinedTotal > 0 && Math.abs(fifoTotal - combinedTotal) >= 0.01,
  };
}

export async function takeEncomendaSignal(input: {
  requestId: string;
  amount: number;
  payment?: PaymentMethod;
  payments?: SalePayment[];
}) {
  const db = getDb();
  const request = await db.requests.get(input.requestId);
  if (!request || storeRequestKind(request) !== "encomenda") {
    throw new EncomendaError("Este sinal é só da encomenda da loja.");
  }
  if (request.deliveredAt) throw new EncomendaError("Esta festa já foi entregue.");
  if (request.signalSaleId) throw new EncomendaError("O sinal desta festa já entrou.");
  if (!isStore(request.fromLocationId)) throw new EncomendaError("Só a loja recebe o sinal.");

  const amount = validateEncomendaSignalAmount(request, input.amount);
  const session = await currentCashSession(request.fromLocationId);
  if (!session) throw new EncomendaError("Abra o caixa deste período antes de receber o sinal.");

  const actor = await assertOperatorCanCash(EncomendaError);
  const payments = paymentsOf(amount, input);
  const saleId = newId();
  const at = new Date().toISOString();

  try {
    await db.transaction("rw", [db.requests, db.sales, db.cashSessions], async () => {
      const live = await db.cashSessions.get(session.id);
      if (!live || live.closedAt || live.locationId !== request.fromLocationId) {
        throw new EncomendaError("Abra o caixa deste período antes de receber o sinal.");
      }
      await recordEncomendaSignalInTx(db, {
        requestId: request.id,
        locationId: request.fromLocationId,
        amount,
        payments,
        actorId: actor.actorId,
        at,
        sessionId: live.id,
        saleId,
      });
    });
  } catch (err) {
    asStock(err);
  }
  const { notifyFactoryOfEncomenda } = await import("./requests");
  await notifyFactoryOfEncomenda(input.requestId);
  const { syncOpenWellStatuses } = await import("./requests");
  await syncOpenWellStatuses();
  return saleId;
}

export function validateEncomendaSignalAmount(
  request: Pick<StockRequest, "estimatedTotal">,
  rawAmount: number,
) {
  const total = money2(request.estimatedTotal ?? 0);
  if (total <= 0) throw new EncomendaError("Falta o valor da festa para receber o sinal.");
  const amount = money2(rawAmount);
  if (amount <= 0 || amount >= total) {
    throw new EncomendaError("O sinal tem que ser maior que zero e menor que o total.");
  }
  return amount;
}

export async function recordEncomendaSignalInTx(
  db: ReturnType<typeof getDb>,
  input: {
    requestId: string;
    locationId: string;
    amount: number;
    payments: SalePayment[];
    actorId: string;
    at: string;
    sessionId: string;
    saleId: string;
  },
) {
  const current = await db.requests.get(input.requestId);
  if (!current || current.signalSaleId) throw new EncomendaError("O sinal desta festa já entrou.");
  await db.sales.add({
    id: input.saleId,
    locationId: input.locationId,
    channel: "encomenda",
    payment: input.payments[0]?.method ?? "pix",
    payments: input.payments.length > 1 ? input.payments : undefined,
    total: input.amount,
    at: input.at,
    cashSessionId: input.sessionId,
    kind: "sinal",
    requestId: input.requestId,
    actorId: input.actorId,
  });
  await db.requests.update(input.requestId, { signalAmount: input.amount, signalSaleId: input.saleId });
}

export async function deliverEncomenda(input: {
  requestId: string;
  payment?: PaymentMethod;
  payments?: SalePayment[];
}) {
  const db = getDb();
  const request = await db.requests.get(input.requestId);
  if (!request || storeRequestKind(request) !== "encomenda") {
    throw new EncomendaError("Só a encomenda da loja entrega no balcão.");
  }
  if (request.deliveredAt) throw new EncomendaError("Esta festa já foi entregue.");
  if (!request.signalSaleId || !request.signalAmount) {
    throw new EncomendaError("Receba o sinal antes de entregar.");
  }
  if (request.status !== "sent") {
    throw new EncomendaError("A fábrica ainda não mandou o pedido inteiro.");
  }

  const transfers = (await db.transfers.toArray()).filter((row) => row.requestId === request.id);
  if (transfers.length === 0) {
    throw new EncomendaError("A fábrica ainda não mandou este pedido.");
  }
  if (transfers.some((row) => transferStatus(row) === "em_transito")) {
    throw new EncomendaError("Confira o envio em Receber antes de entregar a festa.");
  }

  const items = await db.requestItems.where("requestId").equals(request.id).toArray();
  const payload = items
    .filter((item) => (item.sentQty ?? 0) > 0)
    .map((item) => ({ nicheId: item.nicheId, qty: item.sentQty ?? 0 }));
  if (payload.length === 0) throw new EncomendaError("Não tem o que entregar neste pedido.");

  const quote = await quoteEncomendaDelivery(request.id);
  const total = quote.combinedTotal;
  const credit = money2(request.signalAmount);
  const due = quote.due;
  if (due <= 0) throw new EncomendaError("O resto desta festa não fecha. Confira o total e o sinal.");

  let saleId = "";
  try {
    saleId = await checkout({
      locationId: request.fromLocationId,
      channel: "encomenda",
      payment: input.payment,
      payments: input.payments,
      items: payload,
      saleTotal: total,
      signalCredit: credit,
      requestId: request.id,
      markPartyDelivered: true,
    });
  } catch (err) {
    asStock(err);
  }
  return saleId;
}

export type PartyStockState = "aguardando" | "parcial" | "sem_saldo" | "em_transito" | "na_loja";

export type OpenParty = {
  id: string;
  storeId: string;
  storeName: string;
  neededBy: string;
  guestName: string;
  estimatedTotal: number;
  signalAmount: number;
  due: number;
  fifoTotal?: number;
  priceDiffers?: boolean;
  stock: PartyStockState;
  stockLabel: string;
  itemsLabel: string;
  at: string;
};

export function partyDue(estimatedTotal?: number, signalAmount?: number) {
  return money2((estimatedTotal ?? 0) - (signalAmount ?? 0));
}

export function isOpenPartyRequest(row: {
  kind?: StockRequest["kind"];
  status?: StockRequest["status"];
  deliveredAt?: string;
  signalSaleId?: string;
  signalAmount?: number;
}) {
  if (storeRequestKind(row) !== "encomenda") return false;
  if (row.status === "cancelled") return false;
  if (row.deliveredAt) return false;
  if (!row.signalSaleId) return false;
  return money2(row.signalAmount ?? 0) > 0;
}

export function partyMoneyPhrase(input: {
  estimatedTotal?: number;
  signalAmount?: number;
  deliveredAt?: string;
}) {
  if (input.deliveredAt) return "Festa entregue";
  const signal = money2(input.signalAmount ?? 0);
  if (signal <= 0) return "";
  const due = partyDue(input.estimatedTotal, signal);
  return due > 0 ? `Sinal ${formatBRL(signal)} · faltam ${formatBRL(due)}` : `Sinal ${formatBRL(signal)}`;
}

export function partyStockLabel(stock: PartyStockState) {
  return {
    aguardando: "Aguardando a fábrica mandar",
    parcial: "Mandou parte",
    sem_saldo: "Fábrica sem saldo",
    em_transito: "A caminho — a loja ainda confere",
    na_loja: "Já na loja — falta o resto no dia",
  }[stock];
}

function partyStockOf(request: StockRequest, items: StockRequestItem[], transfers: Transfer[]): PartyStockState {
  const leftover = items.some((item) => (item.sentQty ?? 0) < item.qty);
  if (request.status === "sem_saldo") return "sem_saldo";
  if (leftover || isOpenRequest(request.status)) {
    if (request.status === "parcial" || items.some((item) => (item.sentQty ?? 0) > 0)) return "parcial";
    return "aguardando";
  }
  const mine = transfers.filter((row) => row.requestId === request.id);
  if (mine.some((row) => transferStatus(row) === "em_transito")) return "em_transito";
  return "na_loja";
}

export async function listOpenParties(storeId?: string): Promise<OpenParty[]> {
  const db = getDb();
  const [requests, requestItems, transfers, catalog] = await Promise.all([
    db.requests.toArray(),
    db.requestItems.toArray(),
    db.transfers.toArray(),
    catalogItems(false),
  ]);
  const itemsByRequest = new Map<string, StockRequestItem[]>();
  for (const item of requestItems) {
    const list = itemsByRequest.get(item.requestId) ?? [];
    list.push(item);
    itemsByRequest.set(item.requestId, list);
  }

  const parties: OpenParty[] = [];
  for (const request of requests) {
    if (storeId && request.fromLocationId !== storeId) continue;
    if (!isOpenPartyRequest(request)) continue;
    const signal = money2(request.signalAmount ?? 0);

    const items = itemsByRequest.get(request.id) ?? [];
    const stock = partyStockOf(request, items, transfers);
    const labels = items
      .map((item) => {
        const found = catalog.find((row) => row.niche.id === item.nicheId);
        return found ? `${item.qty} ${found.label}` : `${item.qty}`;
      })
      .slice(0, 4)
      .join(", ");

    let fifoTotal: number | undefined;
    let priceDiffers: boolean | undefined;
    if (stock === "na_loja") {
      try {
        const quote = await quoteEncomendaDelivery(request.id);
        fifoTotal = quote.fifoTotal;
        priceDiffers = quote.differs;
      } catch {
        /* prateleira ainda não fecha — segue só o combinado */
      }
    }

    parties.push({
      id: request.id,
      storeId: request.fromLocationId,
      storeName: getLocation(request.fromLocationId)?.name ?? "Loja",
      neededBy: request.neededBy ?? "",
      guestName: request.guestName?.trim() ?? "",
      estimatedTotal: money2(request.estimatedTotal ?? 0),
      signalAmount: signal,
      due: partyDue(request.estimatedTotal, signal),
      fifoTotal,
      priceDiffers,
      stock,
      stockLabel: partyStockLabel(stock),
      itemsLabel: labels,
      at: request.at,
    });
  }

  return parties.sort((a, b) => {
    const day = (a.neededBy || "9999").localeCompare(b.neededBy || "9999");
    if (day !== 0) return day;
    return a.at.localeCompare(b.at);
  });
}

export function partyIsOverdue(neededBy: string, today = todayDate()) {
  return Boolean(neededBy) && neededBy < today;
}
