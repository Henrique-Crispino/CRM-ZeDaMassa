import { currentCashSession, money2 } from "./cash";
import { getDb } from "./db";
import { getLocation, isStore } from "./locations";
import { formatBRL, newId, todayDate } from "./money";
import { checkout, StockError } from "./stock";
import { catalogItems } from "./queries";
import type { PaymentMethod, SalePayment, StockRequest, StockRequestItem, Transfer } from "./types";
import { isOpenRequest, PAYMENT_METHODS, storeRequestKind, transferStatus } from "./types";

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

export async function estimateEncomendaTotal(items: { nicheId: string; qty: number }[]) {
  const catalog = await catalogItems(false);
  return money2(
    items.reduce((sum, item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return sum + (found?.niche.sellPrice ?? 0) * item.qty;
    }, 0),
  );
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

  const total = money2(request.estimatedTotal ?? 0);
  if (total <= 0) throw new EncomendaError("Falta o valor da festa para receber o sinal.");
  const amount = money2(input.amount);
  if (amount <= 0 || amount >= total) {
    throw new EncomendaError("O sinal tem que ser maior que zero e menor que o total.");
  }

  const session = await currentCashSession(request.fromLocationId);
  if (!session) throw new EncomendaError("Abra o caixa deste período antes de receber o sinal.");

  const payments = paymentsOf(amount, input);
  const saleId = newId();
  const at = new Date().toISOString();

  try {
    await db.transaction("rw", [db.requests, db.sales, db.cashSessions], async () => {
      const live = await db.cashSessions.get(session.id);
      if (!live || live.closedAt || live.locationId !== request.fromLocationId) {
        throw new EncomendaError("Abra o caixa deste período antes de receber o sinal.");
      }
      const current = await db.requests.get(request.id);
      if (!current || current.signalSaleId) throw new EncomendaError("O sinal desta festa já entrou.");
      await db.sales.add({
        id: saleId,
        locationId: request.fromLocationId,
        channel: "caixa",
        payment: payments[0]?.method ?? "pix",
        payments: payments.length > 1 ? payments : undefined,
        total: amount,
        at,
        cashSessionId: live.id,
        kind: "sinal",
        requestId: request.id,
      });
      await db.requests.update(request.id, { signalAmount: amount, signalSaleId: saleId });
    });
  } catch (err) {
    asStock(err);
  }
  return saleId;
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

  const total = money2(request.estimatedTotal ?? 0);
  const credit = money2(request.signalAmount);
  const due = money2(total - credit);
  if (due <= 0) throw new EncomendaError("O resto desta festa não fecha. Confira o total e o sinal.");

  let saleId = "";
  try {
    saleId = await checkout({
      locationId: request.fromLocationId,
      channel: "caixa",
      payment: input.payment,
      payments: input.payments,
      items: payload,
      saleTotal: total,
      signalCredit: credit,
      requestId: request.id,
    });
  } catch (err) {
    asStock(err);
  }

  await db.requests.update(request.id, {
    remainderSaleId: saleId,
    deliveredAt: new Date().toISOString(),
  });
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

    parties.push({
      id: request.id,
      storeId: request.fromLocationId,
      storeName: getLocation(request.fromLocationId)?.name ?? "Loja",
      neededBy: request.neededBy ?? "",
      guestName: request.guestName?.trim() ?? "",
      estimatedTotal: money2(request.estimatedTotal ?? 0),
      signalAmount: signal,
      due: partyDue(request.estimatedTotal, signal),
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
