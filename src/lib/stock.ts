import { isPurchased } from "./categories";
import { currentCashSession, money2 } from "./cash";
import { getDb } from "./db";
import { isStore } from "./locations";
import { addDays, daysUntil, newId, todayDate } from "./money";
import { changeStock, oldestLots, StockError, stockQty } from "./stock-core";
import type { AdjustmentReason, InventoryLine, PaymentMethod, ReturnReason, SaleChannel, SalePayment, SaleVoidReason } from "./types";
import {
  ADJUSTMENT_REASONS,
  PAYMENT_METHODS,
  RETURN_REASONS,
  SALE_VOID_REASONS,
  lotCost,
  promoIsLive,
  promoStatus,
  transferKind,
  transferStatus,
} from "./types";

export { StockError, stockQty } from "./stock-core";

export async function produceItems(input: {
  items: { nicheId: string; qty: number }[];
  madeAt: string;
}) {
  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe a quantidade que foi produzida.");
  }

  const db = getDb();
  const refId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));

  await db.transaction("rw", [db.lots, db.stock, db.movements, db.niches, db.products], async () => {
    for (const [index, item] of items.entries()) {
      const product = products[index];
      if (product && isPurchased(product.category)) {
        throw new StockError(`${product.name} não se produz. Dê entrada em Compras.`);
      }
      const lotId = newId();
      const expiresAt =
        product?.perishable && product.shelfLifeDays > 0
          ? addDays(input.madeAt, product.shelfLifeDays)
          : undefined;
      await db.lots.add({
        id: lotId,
        nicheId: item.nicheId,
        madeAt: input.madeAt,
        expiresAt,
        unitCost: niches[index]?.costPrice ?? 0,
      });
      await changeStock("factory", item.nicheId, lotId, item.qty);
      await db.movements.add({
        id: newId(),
        locationId: "factory",
        nicheId: item.nicheId,
        lotId,
        qty: item.qty,
        type: "production",
        refId,
        at,
      });
    }
  });

  return refId;
}

export async function receivePurchase(input: {
  items: { nicheId: string; qty: number; unitCost: number; expiresAt?: string }[];
  receivedAt: string;
}) {
  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe o que chegou da compra.");
  }

  const db = getDb();
  const refId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));

  await db.transaction("rw", [db.lots, db.stock, db.movements, db.niches, db.products], async () => {
    for (const [index, item] of items.entries()) {
      const niche = niches[index];
      const product = products[index];
      if (!niche || !product) throw new StockError("Produto não encontrado.");
      if (!isPurchased(product.category)) {
        throw new StockError(`${product.name} é fabricado. Lance em Produzir.`);
      }
      const unitCost = Number.isFinite(item.unitCost) ? Math.max(0, item.unitCost) : niche.costPrice;
      const expiresAt =
        item.expiresAt ||
        (product.perishable && product.shelfLifeDays > 0
          ? addDays(input.receivedAt, product.shelfLifeDays)
          : undefined);
      const lotId = newId();
      await db.lots.add({
        id: lotId,
        nicheId: item.nicheId,
        madeAt: input.receivedAt,
        expiresAt,
        unitCost,
      });
      await changeStock("factory", item.nicheId, lotId, item.qty);
      await db.movements.add({
        id: newId(),
        locationId: "factory",
        nicheId: item.nicheId,
        lotId,
        qty: item.qty,
        type: "purchase",
        refId,
        at,
      });
    }
  });

  return refId;
}

export async function sendToStore(input: {
  toLocationId: string;
  items: { nicheId: string; qty: number }[];
  sentBy?: string;
}) {
  if (!isStore(input.toLocationId)) {
    throw new StockError("Escolha uma loja para receber o envio.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Escolha pelo menos um produto para mandar.");
  }

  const db = getDb();
  const transferId = newId();
  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.transfers, db.transferItems],
    async () => {
      await db.transfers.add({
        id: transferId,
        fromLocationId: "factory",
        toLocationId: input.toLocationId,
        at,
        status: "em_transito",
        kind: "envio",
        sentBy: input.sentBy?.trim() || "Fábrica",
      });

      for (const item of items) {
        const chunks = await oldestLots("factory", item.nicheId, item.qty, { skipExpired: true });
        for (const chunk of chunks) {
          await changeStock("factory", item.nicheId, chunk.lotId, -chunk.qty);
          await db.transferItems.add({
            id: newId(),
            transferId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
          });
          await db.movements.add({
            id: newId(),
            locationId: "factory",
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: -chunk.qty,
            type: "send",
            refId: transferId,
            at,
          });
        }
      }
    },
  );

  return transferId;
}

export async function receiveTransfer(input: {
  transferId: string;
  receivedBy: string;
  items: { id: string; receivedQty: number }[];
}) {
  const receivedBy = input.receivedBy.trim();
  if (!receivedBy) throw new StockError("Falta quem conferiu o que chegou.");

  const db = getDb();
  const transfer = await db.transfers.get(input.transferId);
  if (!transfer) throw new StockError("Envio não encontrado.");
  if (transferKind(transfer) === "devolucao") {
    throw new StockError("Esta é uma devolução. Confira em Devolver.");
  }
  if (transferStatus(transfer) !== "em_transito") {
    throw new StockError("Este envio já foi conferido.");
  }

  const parts = await db.transferItems.where("transferId").equals(transfer.id).toArray();
  if (parts.length === 0) throw new StockError("Este envio não tem itens para conferir.");

  const qtyById = new Map(
    input.items.map((item) => [item.id, Math.max(0, Math.floor(item.receivedQty))]),
  );
  for (const part of parts) {
    if (!qtyById.has(part.id)) {
      throw new StockError("Confera todos os itens deste envio.");
    }
    if ((qtyById.get(part.id) ?? 0) > part.qty) {
      throw new StockError(
        "Não dá para conferir mais do que a fábrica mandou. O que veio a mais não entra aqui — isso é inventário.",
      );
    }
  }

  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.transfers, db.transferItems],
    async () => {
      const current = await db.transfers.get(transfer.id);
      if (!current || transferStatus(current) !== "em_transito") {
        throw new StockError("Este envio já foi conferido.");
      }

      let divergente = false;
      for (const part of parts) {
        const receivedQty = qtyById.get(part.id) ?? 0;
        const returnedQty = part.qty - receivedQty;
        if (returnedQty > 0) divergente = true;
        if (receivedQty > 0) {
          await changeStock(transfer.toLocationId, part.nicheId, part.lotId, receivedQty);
          await db.movements.add({
            id: newId(),
            locationId: transfer.toLocationId,
            nicheId: part.nicheId,
            lotId: part.lotId,
            qty: receivedQty,
            type: "send",
            refId: transfer.id,
            at,
          });
        }
        if (returnedQty > 0) {
          await changeStock("factory", part.nicheId, part.lotId, returnedQty);
          await db.movements.add({
            id: newId(),
            locationId: "factory",
            nicheId: part.nicheId,
            lotId: part.lotId,
            qty: returnedQty,
            type: "send",
            refId: transfer.id,
            at,
          });
        }
        await db.transferItems.update(part.id, { receivedQty });
      }

      await db.transfers.update(transfer.id, {
        status: divergente ? "divergente" : "conferido",
        receivedAt: at,
        receivedBy,
      });
    },
  );
}

export async function returnToFactory(input: {
  fromLocationId: string;
  reason: ReturnReason;
  items: { nicheId: string; qty: number }[];
}) {
  if (!isStore(input.fromLocationId)) {
    throw new StockError("A devolução sai da loja para a fábrica.");
  }
  if (!RETURN_REASONS.some((item) => item.id === input.reason)) {
    throw new StockError("Escolha o motivo: lote errado, excedente ou qualidade.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Escolha o que vai devolver.");
  }

  const db = getDb();
  const transferId = newId();
  const at = new Date().toISOString();
  const skipExpired = input.reason !== "qualidade";

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.transfers, db.transferItems],
    async () => {
      await db.transfers.add({
        id: transferId,
        fromLocationId: input.fromLocationId,
        toLocationId: "factory",
        at,
        status: "em_transito",
        kind: "devolucao",
        reason: input.reason,
      });

      for (const item of items) {
        const chunks = await oldestLots(input.fromLocationId, item.nicheId, item.qty, {
          skipExpired,
          expiredMessage:
            "Lote vencido não volta como excedente. Descarte no estoque ou devolva por qualidade.",
        });
        for (const chunk of chunks) {
          await changeStock(input.fromLocationId, item.nicheId, chunk.lotId, -chunk.qty);
          await db.transferItems.add({
            id: newId(),
            transferId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
          });
          await db.movements.add({
            id: newId(),
            locationId: input.fromLocationId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: -chunk.qty,
            type: "return",
            refId: transferId,
            at,
          });
        }
      }
    },
  );

  return transferId;
}

export async function receiveReturn(input: {
  transferId: string;
  receivedBy: string;
  items: { id: string; acceptedQty: number }[];
}) {
  const receivedBy = input.receivedBy.trim();
  if (!receivedBy) throw new StockError("Falta quem conferiu a devolução.");

  const db = getDb();
  const transfer = await db.transfers.get(input.transferId);
  if (!transfer) throw new StockError("Devolução não encontrada.");
  if (transferKind(transfer) !== "devolucao") {
    throw new StockError("Este é um envio. Confira em Receber.");
  }
  if (transferStatus(transfer) !== "em_transito") {
    throw new StockError("Esta devolução já foi conferida.");
  }

  const parts = await db.transferItems.where("transferId").equals(transfer.id).toArray();
  if (parts.length === 0) throw new StockError("Esta devolução não tem itens.");

  const qtyById = new Map(
    input.items.map((item) => [item.id, Math.max(0, Math.floor(item.acceptedQty))]),
  );
  for (const part of parts) {
    if (!qtyById.has(part.id)) {
      throw new StockError("Confera todos os itens desta devolução.");
    }
    if ((qtyById.get(part.id) ?? 0) > part.qty) {
      throw new StockError("Não dá para aceitar mais do que a loja devolveu.");
    }
  }

  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.transfers, db.transferItems, db.wastes, db.niches],
    async () => {
      const current = await db.transfers.get(transfer.id);
      if (!current || transferStatus(current) !== "em_transito") {
        throw new StockError("Esta devolução já foi conferida.");
      }

      let discardedAny = false;
      for (const part of parts) {
        const acceptedQty = Math.min(part.qty, qtyById.get(part.id) ?? 0);
        const discardedQty = part.qty - acceptedQty;
        if (discardedQty > 0) discardedAny = true;

        await changeStock("factory", part.nicheId, part.lotId, part.qty);
        await db.movements.add({
          id: newId(),
          locationId: "factory",
          nicheId: part.nicheId,
          lotId: part.lotId,
          qty: part.qty,
          type: "return",
          refId: transfer.id,
          at,
        });

        if (discardedQty > 0) {
          const niche = await db.niches.get(part.nicheId);
          const lot = await db.lots.get(part.lotId);
          await changeStock("factory", part.nicheId, part.lotId, -discardedQty);
          await db.wastes.add({
            id: newId(),
            locationId: "factory",
            nicheId: part.nicheId,
            lotId: part.lotId,
            qty: discardedQty,
            reason: "devolucao",
            at,
            unitCost: lotCost(lot, niche?.costPrice ?? 0),
            unitPrice: niche?.sellPrice ?? 0,
          });
          await db.movements.add({
            id: newId(),
            locationId: "factory",
            nicheId: part.nicheId,
            lotId: part.lotId,
            qty: -discardedQty,
            type: "waste",
            refId: transfer.id,
            at,
          });
        }

        await db.transferItems.update(part.id, { receivedQty: acceptedQty, discardedQty });
      }

      await db.transfers.update(transfer.id, {
        status: discardedAny ? "divergente" : "conferido",
        receivedAt: at,
        receivedBy,
      });
    },
  );
}

function normalizeSalePayments(total: number, input: { payment?: PaymentMethod; payments?: SalePayment[] }) {
  const raw = (input.payments ?? []).filter((row) => row.amount > 0);
  const lines = raw.length
    ? raw
    : input.payment
      ? [{ method: input.payment, amount: total }]
      : [];
  if (lines.length === 0) {
    throw new StockError("Escolha como o cliente pagou.");
  }

  const byMethod: Record<PaymentMethod, number> = { dinheiro: 0, pix: 0, cartao: 0 };
  for (const row of lines) {
    if (!PAYMENT_METHODS.some((item) => item.id === row.method)) {
      throw new StockError("Forma de pagamento inválida.");
    }
    byMethod[row.method] += money2(row.amount);
  }

  const payments = PAYMENT_METHODS
    .map((item) => ({ method: item.id, amount: money2(byMethod[item.id]) }))
    .filter((row) => row.amount > 0);
  const paid = money2(payments.reduce((sum, row) => sum + row.amount, 0));
  if (Math.abs(paid - money2(total)) >= 0.005) {
    throw new StockError("Os pagamentos têm que somar o total da venda.");
  }
  return payments;
}

export async function checkout(input: {
  locationId: string;
  channel: SaleChannel;
  payment?: PaymentMethod;
  payments?: SalePayment[];
  items: { nicheId: string; qty: number; promo?: boolean }[];
}) {
  if (!isStore(input.locationId)) {
    throw new StockError("A venda é feita na loja, não na fábrica.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Coloque pelo menos um item na venda.");
  }

  const session = await currentCashSession(input.locationId);
  if (!session) {
    throw new StockError("Abra o caixa deste período antes de vender.");
  }

  const db = getDb();
  const saleId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.sales, db.saleItems, db.niches, db.cashSessions],
    async () => {
      let total = 0;

      for (const [index, item] of items.entries()) {
        const niche = niches[index];
        if (!niche) throw new StockError("Produto não encontrado.");
        const usePromo = Boolean(item.promo && promoIsLive(niche));
        if (item.promo && !usePromo) {
          const status = promoStatus(niche);
          throw new StockError(
            status === "ended"
              ? `${niche.name}: a promoção já acabou.`
              : status === "scheduled"
                ? `${niche.name}: a promoção ainda não começou.`
                : `${niche.name} não está liberado para promoção.`,
          );
        }
        const unitPrice = usePromo ? niche.promoPrice : niche.sellPrice;
        const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, { skipExpired: true });
        for (const chunk of chunks) {
          const lot = await db.lots.get(chunk.lotId);
          if (usePromo && niche.promoOnlyExpiringToday && (!lot?.expiresAt || daysUntil(lot.expiresAt) !== 0)) {
            throw new StockError(`${niche.name}: esta promoção só vale para o que vence hoje.`);
          }
          await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
          await db.saleItems.add({
            id: newId(),
            saleId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
            unitPrice,
            unitCost: lotCost(lot, niche.costPrice),
            promo: usePromo,
          });
          await db.movements.add({
            id: newId(),
            locationId: input.locationId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: -chunk.qty,
            type: "sale",
            refId: saleId,
            at,
          });
          total += chunk.qty * unitPrice;
        }
      }

      const payments = normalizeSalePayments(total, input);
      await db.sales.add({
        id: saleId,
        locationId: input.locationId,
        channel: input.channel,
        payment: payments[0]?.method ?? "dinheiro",
        payments: payments.length > 1 ? payments : undefined,
        total,
        at,
        cashSessionId: session.id,
      });
    },
  );

  return saleId;
}

export async function voidSale(input: { saleId: string; reason: SaleVoidReason }) {
  if (!SALE_VOID_REASONS.some((item) => item.id === input.reason)) {
    throw new StockError("Escolha o motivo do estorno: quantidade, produto errado ou desistência.");
  }

  const db = getDb();
  const sale = await db.sales.get(input.saleId);
  if (!sale) throw new StockError("Venda não encontrada.");
  if (sale.voidedAt) throw new StockError("Esta venda já foi estornada.");
  if (!sale.cashSessionId) {
    throw new StockError("Esta venda não tem caixa. Não dá para estornar.");
  }

  const session = await db.cashSessions.get(sale.cashSessionId);
  if (!session || session.closedAt) {
    throw new StockError("O caixa desta venda já fechou. Não dá para estornar neste turno.");
  }

  const items = await db.saleItems.where("saleId").equals(sale.id).toArray();
  if (items.length === 0) throw new StockError("Esta venda não tem itens para devolver.");

  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.sales, db.saleItems, db.cashSessions],
    async () => {
      const current = await db.sales.get(sale.id);
      if (!current || current.voidedAt) throw new StockError("Esta venda já foi estornada.");
      const open = await db.cashSessions.get(sale.cashSessionId ?? "");
      if (!open || open.closedAt) {
        throw new StockError("O caixa desta venda já fechou. Não dá para estornar neste turno.");
      }

      for (const item of items) {
        await changeStock(sale.locationId, item.nicheId, item.lotId, item.qty);
        await db.movements.add({
          id: newId(),
          locationId: sale.locationId,
          nicheId: item.nicheId,
          lotId: item.lotId,
          qty: item.qty,
          type: "sale_void",
          refId: sale.id,
          at,
        });
      }

      await db.sales.update(sale.id, {
        voidedAt: at,
        voidReason: input.reason,
      });
    },
  );
}

export async function registerWaste(input: {
  locationId: string;
  items: { nicheId: string; qty: number }[];
}) {
  if (!isStore(input.locationId)) {
    throw new StockError("A sobra do dia é lançada na loja.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe o que sobrou e não vendeu.");
  }

  const db = getDb();
  const refId = newId();
  const at = new Date().toISOString();

  await db.transaction("rw", [db.stock, db.lots, db.movements, db.wastes, db.niches], async () => {
    for (const item of items) {
      const niche = await db.niches.get(item.nicheId);
      const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, {
        skipExpired: true,
        expiredMessage:
          "Sobra é o que foi frito e não vendeu. Lote vencido não entra aqui. Descarte no estoque.",
      });
      for (const chunk of chunks) {
        const lot = await db.lots.get(chunk.lotId);
        await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
        await db.wastes.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: item.nicheId,
          lotId: chunk.lotId,
          qty: chunk.qty,
          reason: "sobra_frito",
          at,
          unitCost: lotCost(lot, niche?.costPrice ?? 0),
          unitPrice: niche?.sellPrice ?? 0,
        });
        await db.movements.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: item.nicheId,
          lotId: chunk.lotId,
          qty: -chunk.qty,
          type: "waste",
          refId,
          at,
        });
      }
    }
  });

  return refId;
}

export async function discardExpiredLots(input: {
  items: { locationId: string; nicheId: string; lotId: string; qty: number }[];
}) {
  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Escolha pelo menos um lote vencido para descartar.");
  }

  const db = getDb();
  const today = todayDate();
  const refId = newId();
  const at = new Date().toISOString();

  await db.transaction("rw", [db.stock, db.lots, db.movements, db.wastes, db.niches], async () => {
    for (const item of items) {
      const lot = await db.lots.get(item.lotId);
      if (!lot?.expiresAt || lot.expiresAt >= today) {
        throw new StockError("Só dá para descartar lote que já venceu.");
      }
      const niche = await db.niches.get(item.nicheId);
      await changeStock(item.locationId, item.nicheId, item.lotId, -item.qty);
      await db.wastes.add({
        id: newId(),
        locationId: item.locationId,
        nicheId: item.nicheId,
        lotId: item.lotId,
        qty: item.qty,
        reason: "vencido",
        at,
        unitCost: lotCost(lot, niche?.costPrice ?? 0),
        unitPrice: niche?.sellPrice ?? 0,
      });
      await db.movements.add({
        id: newId(),
        locationId: item.locationId,
        nicheId: item.nicheId,
        lotId: item.lotId,
        qty: -item.qty,
        type: "waste",
        refId,
        at,
      });
    }
  });

  return refId;
}

async function stockOnLot(locationId: string, nicheId: string, lotId: string) {
  const row = await getDb().stock.get(`${locationId}:${nicheId}:${lotId}`);
  return row?.qty ?? 0;
}

async function stockOnNiche(locationId: string, nicheId: string) {
  const rows = await getDb().stock.where("[locationId+nicheId]").equals([locationId, nicheId]).toArray();
  return rows.reduce((sum, row) => sum + row.qty, 0);
}

export async function applyInventory(input: {
  locationId: string;
  countedBy: string;
  lines: { nicheId: string; lotId?: string; countedQty: number; reason?: AdjustmentReason }[];
}) {
  if (input.locationId !== "factory" && !isStore(input.locationId)) {
    throw new StockError("Escolha a fábrica ou uma loja para contar.");
  }

  const countedBy = input.countedBy.trim();
  if (!countedBy) throw new StockError("Falta o responsável desta contagem.");

  const db = getDb();
  const countId = newId();
  const at = new Date().toISOString();
  const diffs: InventoryLine[] = [];

  for (const line of input.lines) {
    const countedQty = Math.max(0, Math.floor(line.countedQty));
    const systemQty = line.lotId
      ? await stockOnLot(input.locationId, line.nicheId, line.lotId)
      : await stockOnNiche(input.locationId, line.nicheId);
    const delta = countedQty - systemQty;
    if (delta === 0) continue;
    if (!line.reason || !ADJUSTMENT_REASONS.some((item) => item.id === line.reason)) {
      throw new StockError("Informe o motivo de cada diferença: quebra, furto, erro de lançamento ou contagem.");
    }
    diffs.push({
      id: newId(),
      countId,
      nicheId: line.nicheId,
      lotId: line.lotId,
      systemQty,
      countedQty,
      reason: line.reason,
    });
  }

  if (diffs.length === 0) {
    throw new StockError("A contagem bateu com o sistema. Não há ajuste para lançar.");
  }

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.niches, db.products, db.inventoryCounts, db.inventoryLines],
    async () => {
      await db.inventoryCounts.add({
        id: countId,
        locationId: input.locationId,
        at,
        countedBy,
      });

      for (const line of diffs) {
        const delta = line.countedQty - line.systemQty;
        let lotId = line.lotId;
        if (lotId) {
          await changeStock(input.locationId, line.nicheId, lotId, delta);
        } else if (delta < 0) {
          const chunks = await oldestLots(input.locationId, line.nicheId, -delta);
          for (const chunk of chunks) {
            await changeStock(input.locationId, line.nicheId, chunk.lotId, -chunk.qty);
            await db.movements.add({
              id: newId(),
              locationId: input.locationId,
              nicheId: line.nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "ajuste",
              refId: countId,
              at,
            });
          }
          await db.inventoryLines.add(line);
          continue;
        } else {
          const niche = await db.niches.get(line.nicheId);
          const product = niche ? await db.products.get(niche.productId) : undefined;
          const existing = await db.stock
            .where("[locationId+nicheId]")
            .equals([input.locationId, line.nicheId])
            .toArray();
          const lots = await db.lots.bulkGet(existing.map((row) => row.lotId));
          const newest = lots
            .filter((lot): lot is NonNullable<typeof lot> => Boolean(lot))
            .sort((a, b) => b.madeAt.localeCompare(a.madeAt))[0];
          if (newest) {
            lotId = newest.id;
            await changeStock(input.locationId, line.nicheId, newest.id, delta);
          } else {
            lotId = newId();
            await db.lots.add({
              id: lotId,
              nicheId: line.nicheId,
              madeAt: todayDate(),
              expiresAt:
                product?.perishable && product.shelfLifeDays > 0
                  ? addDays(todayDate(), product.shelfLifeDays)
                  : undefined,
              unitCost: niche?.costPrice ?? 0,
            });
            await changeStock(input.locationId, line.nicheId, lotId, delta);
          }
        }

        await db.movements.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: line.nicheId,
          lotId: lotId ?? "",
          qty: delta,
          type: "ajuste",
          refId: countId,
          at,
        });
        await db.inventoryLines.add({ ...line, lotId: line.lotId ?? lotId });
      }
    },
  );

  return countId;
}

export async function listInventoryCounts(locationId?: string) {
  const db = getDb();
  const rows = locationId
    ? await db.inventoryCounts.where("locationId").equals(locationId).toArray()
    : await db.inventoryCounts.toArray();
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function inventoryCountDetails(countId: string) {
  const db = getDb();
  const count = await db.inventoryCounts.get(countId);
  if (!count) return null;
  const lines = await db.inventoryLines.where("countId").equals(countId).toArray();
  return { count, lines };
}
