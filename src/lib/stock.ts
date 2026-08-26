import { stampActor, assertWitness } from "./actor";
import { isClosedPackage, isPurchased, isSoldAtRegister, notForSaleMessage } from "./categories";
import { ComboError, loadComboForCheckout, splitComboPrice } from "./combos";
import { currentCashSession, money2, sessionLedger } from "./cash";
import { getDb } from "./db";
import { isStore } from "./locations";
import { addDays, daysUntil, newId, todayDate } from "./money";
import { changeStock, oldestLots, StockError, stockQty } from "./stock-core";
import type { AdjustmentReason, CashDestination, InventoryLine, PaymentMethod, ReturnReason, SaleChannel, SaleKind, SalePayment, SaleVoidReason } from "./types";
import {
  ADJUSTMENT_REASONS,
  CASH_DESTINATIONS,
  PAYMENT_METHODS,
  RETURN_REASONS,
  SALE_VOID_REASONS,
  closedCatalogMessage,
  lotCost,
  lotPrice,
  fifoSaleTotal,
  saleLotPrice,
  needsInventoryRecount,
  productIsLive,
  promoIsLive,
  promoStatus,
  transferKind,
  transferStatus,
} from "./types";

export { StockError, stockQty } from "./stock-core";

export async function assertLiveNiches(nicheIds: string[]) {
  const db = getDb();
  const unique = [...new Set(nicheIds)];
  const niches = await db.niches.bulkGet(unique);
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));
  for (const product of products) {
    if (product && !productIsLive(product)) {
      throw new StockError(closedCatalogMessage(product.name));
    }
  }
}

export async function produceItems(input: {
  items: { nicheId: string; qty: number }[];
  madeAt: string;
}) {
  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe a quantidade que foi produzida.");
  }

  const actor = await stampActor(StockError);
  await assertLiveNiches(items.map((item) => item.nicheId));

  const db = getDb();
  const refId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));

  await db.transaction("rw", [db.lots, db.stock, db.movements, db.niches, db.products], async () => {
    for (const [index, item] of items.entries()) {
      const niche = niches[index];
      const product = products[index];
      if (!niche) throw new StockError("Produto não encontrado.");
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
        unitCost: niche.costPrice,
        unitPrice: niche.sellPrice,
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
        actorId: actor.actorId,
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

  const actor = await stampActor(StockError);
  await assertLiveNiches(items.map((item) => item.nicheId));

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
      const expiresAt = item.expiresAt?.slice(0, 10) || undefined;
      if (product.perishable) {
        if (!expiresAt) {
          throw new StockError(`${product.name} é perecível. Informe a validade do lote.`);
        }
        if (expiresAt < input.receivedAt.slice(0, 10)) {
          throw new StockError(`A validade de ${product.name} não pode ser antes do dia da entrada.`);
        }
      }
      const lotId = newId();
      await db.lots.add({
        id: lotId,
        nicheId: item.nicheId,
        madeAt: input.receivedAt,
        expiresAt,
        unitCost,
        unitPrice: niche.sellPrice,
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
        actorId: actor.actorId,
      });
    }
  });

  return refId;
}

export async function sendToStore(input: {
  toLocationId: string;
  items: { nicheId: string; qty: number }[];
  sentBy?: string;
  respectWell?: boolean;
  requestId?: string;
}) {
  if (!isStore(input.toLocationId)) {
    throw new StockError("Escolha uma loja para receber o envio.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Escolha pelo menos um produto para mandar.");
  }

  const actor = await stampActor(StockError);
  await assertLiveNiches(items.map((item) => item.nicheId));

  const db = getDb();
  const transferId = newId();
  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [
      db.stock,
      db.lots,
      db.movements,
      db.transfers,
      db.transferItems,
      db.requests,
      db.requestItems,
      db.factoryOrders,
      db.factoryOrderItems,
      db.customers,
      db.niches,
      db.products,
    ],
    async () => {
      if (input.respectWell !== false) {
        const { assertFactoryFreeQty } = await import("./requests");
        await assertFactoryFreeQty(items);
      }
      await db.transfers.add({
        id: transferId,
        fromLocationId: "factory",
        toLocationId: input.toLocationId,
        at,
        status: "em_transito",
        kind: "envio",
        sentBy: actor.actorName,
        sentById: actor.actorId,
        requestId: input.requestId,
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
            actorId: actor.actorId,
          });
        }
      }
    },
  );

  return transferId;
}

export async function receiveTransfer(input: {
  transferId: string;
  receivedBy?: string;
  items: { id: string; receivedQty: number }[];
}) {
  const actor = await stampActor(StockError);
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
            actorId: actor.actorId,
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
            actorId: actor.actorId,
          });
        }
        await db.transferItems.update(part.id, { receivedQty });
      }

      await db.transfers.update(transfer.id, {
        status: divergente ? "divergente" : "conferido",
        receivedAt: at,
        receivedBy: actor.actorName,
        receivedById: actor.actorId,
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

  const actor = await stampActor(StockError);
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
        sentBy: actor.actorName,
        sentById: actor.actorId,
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
            actorId: actor.actorId,
          });
        }
      }
    },
  );

  return transferId;
}

export async function receiveReturn(input: {
  transferId: string;
  receivedBy?: string;
  items: { id: string; acceptedQty: number }[];
}) {
  const actor = await stampActor(StockError);
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
          actorId: actor.actorId,
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
            unitPrice: lotPrice(lot, niche?.sellPrice ?? 0),
            actorId: actor.actorId,
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
            actorId: actor.actorId,
          });
        }

        await db.transferItems.update(part.id, { receivedQty: acceptedQty, discardedQty });
      }

      await db.transfers.update(transfer.id, {
        status: discardedAny ? "divergente" : "conferido",
        receivedAt: at,
        receivedBy: actor.actorName,
        receivedById: actor.actorId,
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
  items?: { nicheId: string; qty: number; promo?: boolean }[];
  combos?: { comboId: string; qty: number }[];
  signalCredit?: number;
  saleTotal?: number;
  requestId?: string;
  kind?: SaleKind;
}) {
  if (!isStore(input.locationId)) {
    throw new StockError("A venda é feita na loja, não na fábrica.");
  }

  const items = (input.items ?? []).filter((item) => item.qty > 0);
  const comboLines = (input.combos ?? []).filter((item) => item.qty > 0);
  if (items.length === 0 && comboLines.length === 0) {
    throw new StockError("Coloque pelo menos um item na venda.");
  }

  await assertLiveNiches(items.map((item) => item.nicheId));

  const actor = await stampActor(StockError);
  const session = await currentCashSession(input.locationId);
  if (!session) {
    throw new StockError("Abra o caixa deste período antes de vender.");
  }

  const db = getDb();
  const saleId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));
  for (const product of products) {
    if (product && !isSoldAtRegister(product.category)) {
      throw new StockError(notForSaleMessage(product.name, product.category));
    }
  }

  await db.transaction(
    "rw",
    [
      db.stock,
      db.lots,
      db.movements,
      db.sales,
      db.saleItems,
      db.niches,
      db.products,
      db.combos,
      db.comboItems,
      db.cashSessions,
    ],
    async () => {
      const live = await db.cashSessions.get(session.id);
      if (!live || live.closedAt || live.locationId !== input.locationId) {
        throw new StockError("Abra o caixa deste período antes de vender.");
      }

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
        const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, { skipExpired: true });
        const priced: { qty: number; unitPrice: number }[] = [];
        for (const chunk of chunks) {
          const lot = await db.lots.get(chunk.lotId);
          if (usePromo && niche.promoOnlyExpiringToday && (!lot?.expiresAt || daysUntil(lot.expiresAt) !== 0)) {
            throw new StockError(`${niche.name}: esta promoção só vale para o que vence hoje.`);
          }
          const unitPrice = saleLotPrice(lot, niche.sellPrice, niche.promoPrice, usePromo);
          priced.push({ qty: chunk.qty, unitPrice });
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
            actorId: actor.actorId,
          });
        }
        total += fifoSaleTotal(priced);
      }

      for (const line of comboLines) {
        let loaded: Awaited<ReturnType<typeof loadComboForCheckout>>;
        try {
          loaded = await loadComboForCheckout(line.comboId);
        } catch (err) {
          throw err instanceof ComboError ? new StockError(err.message) : err;
        }
        const { combo, items: parts } = loaded;
        await assertLiveNiches(parts.map((part) => part.nicheId));
        const partNiches = await db.niches.bulkGet(parts.map((part) => part.nicheId));
        const partProducts = await db.products.bulkGet(partNiches.map((niche) => niche?.productId ?? ""));
        for (const product of partProducts) {
          if (product && !isSoldAtRegister(product.category)) {
            throw new StockError(notForSaleMessage(product.name, product.category));
          }
        }
        const expanded = parts.map((part, index) => ({
          nicheId: part.nicheId,
          qty: part.qty * line.qty,
          sellPrice: partNiches[index]?.sellPrice ?? 0,
          label: partProducts[index]?.name ?? "produto",
        }));
        const packTotal = money2(combo.price * line.qty);
        const allocated = splitComboPrice(packTotal, expanded);
        const plans = [];
        for (const alloc of allocated) {
          try {
            const chunks = await oldestLots(input.locationId, alloc.nicheId, alloc.qty, { skipExpired: true });
            plans.push({ ...alloc, chunks });
          } catch {
            const label = expanded.find((row) => row.nicheId === alloc.nicheId)?.label ?? "um item";
            throw new StockError(
              `O combo ${combo.name} não fecha: falta ${label} nesta loja. Não vende metade.`,
            );
          }
        }
        for (const plan of plans) {
          let leftover = plan.lineTotal;
          for (const [chunkIndex, chunk] of plan.chunks.entries()) {
            const last = chunkIndex === plan.chunks.length - 1;
            const chunkMoney = last ? leftover : money2(plan.unitPrice * chunk.qty);
            leftover = money2(leftover - chunkMoney);
            const lot = await db.lots.get(chunk.lotId);
            const niche = await db.niches.get(plan.nicheId);
            await changeStock(input.locationId, plan.nicheId, chunk.lotId, -chunk.qty);
            await db.saleItems.add({
              id: newId(),
              saleId,
              nicheId: plan.nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              unitPrice: chunk.qty > 0 ? money2(chunkMoney / chunk.qty) : 0,
              unitCost: lotCost(lot, niche?.costPrice ?? 0),
              promo: true,
              comboId: combo.id,
              comboName: combo.name,
              comboPacks: line.qty,
            });
            await db.movements.add({
              id: newId(),
              locationId: input.locationId,
              nicheId: plan.nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "sale",
              refId: saleId,
              at,
              actorId: actor.actorId,
            });
          }
        }
        total = money2(total + packTotal);
      }

      total = money2(total);
      if (input.saleTotal != null) {
        const forced = money2(input.saleTotal);
        if (forced <= 0) throw new StockError("O valor da festa não fecha.");
        total = forced;
      }
      const credit = money2(Math.max(0, input.signalCredit ?? 0));
      if (credit > 0 && credit >= total) {
        throw new StockError("O sinal tem que ser menor que o total da festa.");
      }
      const due = money2(total - credit);
      const payments = normalizeSalePayments(due, input);
      await db.sales.add({
        id: saleId,
        locationId: input.locationId,
        channel: input.channel,
        payment: payments[0]?.method ?? "dinheiro",
        payments: payments.length > 1 || credit > 0 ? payments : undefined,
        total,
        at,
        cashSessionId: live.id,
        kind: input.kind === "sinal" ? "sinal" : "venda",
        requestId: input.requestId,
        actorId: actor.actorId,
      });
    },
  );

  return saleId;
}

export async function voidSale(input: { saleId: string; reason: SaleVoidReason }) {
  if (!SALE_VOID_REASONS.some((item) => item.id === input.reason)) {
    throw new StockError("Escolha o motivo do estorno: quantidade, produto errado ou desistência.");
  }

  const actor = await stampActor(StockError);
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
  if (items.length === 0 && sale.kind !== "sinal") {
    throw new StockError("Esta venda não tem itens para devolver.");
  }

  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.sales, db.saleItems, db.cashSessions, db.requests],
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
          actorId: actor.actorId,
        });
      }

      await db.sales.update(sale.id, {
        voidedAt: at,
        voidReason: input.reason,
        voidedById: actor.actorId,
      });
      if (sale.kind === "sinal" && sale.requestId) {
        const request = await db.requests.get(sale.requestId);
        if (request && request.signalSaleId === sale.id && !request.deliveredAt) {
          await db.requests.update(request.id, { signalAmount: undefined, signalSaleId: undefined });
        }
      }
    },
  );
}

export async function withdrawProductAndCash(input: {
  locationId: string;
  nicheId: string;
  qty: number;
  amount: number;
  reason: string;
  destination: CashDestination;
}) {
  if (!isStore(input.locationId)) {
    throw new StockError("A retirada é na loja, com o caixa aberto.");
  }
  const qty = Math.max(0, Math.floor(input.qty));
  if (qty <= 0) throw new StockError("Informe a quantidade que sai.");
  const amount = money2(input.amount);
  if (amount <= 0) throw new StockError("Informe o valor que sai da gaveta.");
  const reason = input.reason.trim();
  if (!reason) throw new StockError("Informe o motivo da retirada.");
  if (!CASH_DESTINATIONS.some((item) => item.id === input.destination)) {
    throw new StockError("A retirada precisa ir para o cofre ou para o depósito.");
  }

  await assertLiveNiches([input.nicheId]);
  const actor = await stampActor(StockError);
  const session = await currentCashSession(input.locationId);
  if (!session) throw new StockError("Abra o caixa deste período antes de retirar.");

  const db = getDb();
  const at = new Date().toISOString();
  const refId = newId();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.niches, db.products, db.cashSessions, db.cashMovements, db.sales, db.saleItems],
    async () => {
      const live = await db.cashSessions.get(session.id);
      if (!live || live.closedAt || live.locationId !== input.locationId) {
        throw new StockError("Abra o caixa deste período antes de retirar.");
      }
      const ledger = await sessionLedger(live.id);
      if (amount > ledger.expectedCash + 0.001) {
        throw new StockError("A retirada não pode ser maior que o saldo esperado em espécie na gaveta.");
      }
      const chunks = await oldestLots(input.locationId, input.nicheId, qty, { skipExpired: true });
      for (const chunk of chunks) {
        await changeStock(input.locationId, input.nicheId, chunk.lotId, -chunk.qty);
        await db.movements.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: input.nicheId,
          lotId: chunk.lotId,
          qty: -chunk.qty,
          type: "retirada",
          refId,
          at,
          actorId: actor.actorId,
        });
      }
      await db.cashMovements.add({
        id: newId(),
        sessionId: live.id,
        locationId: live.locationId,
        type: "sangria",
        amount,
        reason: `Retirada: ${reason}`,
        at,
        destination: input.destination,
        actorId: actor.actorId,
      });
    },
  );
  return refId;
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

  const actor = await stampActor(StockError);
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
          unitPrice: lotPrice(lot, niche?.sellPrice ?? 0),
          actorId: actor.actorId,
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
          actorId: actor.actorId,
        });
      }
    }
  });

  return refId;
}

export async function openPackages(input: {
  locationId: string;
  items: { nicheId: string; qty: number }[];
}) {
  if (input.locationId !== "factory" && !isStore(input.locationId)) {
    throw new StockError("Abra o pacote na fábrica ou na loja.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe quantos pacotes foram abertos.");
  }

  await assertLiveNiches(items.map((item) => item.nicheId));

  const actor = await stampActor(StockError);
  const db = getDb();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));
  for (const product of products) {
    if (!product) throw new StockError("Produto não encontrado.");
    if (!isClosedPackage(product.category)) {
      throw new StockError(`${product.name} não é pacote. Esta tela é para embalagem e descartável.`);
    }
  }

  const refId = newId();
  const at = new Date().toISOString();

  await db.transaction("rw", [db.stock, db.lots, db.movements, db.niches, db.products], async () => {
    for (const item of items) {
      const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, { skipExpired: true });
      for (const chunk of chunks) {
        await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
        await db.movements.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: item.nicheId,
          lotId: chunk.lotId,
          qty: -chunk.qty,
          type: "uso",
          refId,
          at,
          actorId: actor.actorId,
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

  const actor = await stampActor(StockError);
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
      if (lot.nicheId !== item.nicheId) {
        throw new StockError("Este lote não é deste produto.");
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
        unitPrice: lotPrice(lot, niche?.sellPrice ?? 0),
        actorId: actor.actorId,
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
        actorId: actor.actorId,
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
  lines: { nicheId: string; lotId?: string; countedQty: number; reason?: AdjustmentReason }[];
  secondCounts?: { nicheId: string; lotId?: string; countedQty: number }[];
  recountedById?: string;
  witnessPin?: string;
}) {
  if (input.locationId !== "factory" && !isStore(input.locationId)) {
    throw new StockError("Escolha a fábrica ou uma loja para contar.");
  }

  const actor = await stampActor(StockError);
  const countedBy = actor.actorName;

  const db = getDb();
  const countId = newId();
  const at = new Date().toISOString();

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.niches, db.products, db.inventoryCounts, db.inventoryLines, db.employees],
    async () => {
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

      const big = diffs.filter((line) => needsInventoryRecount(line.countedQty - line.systemQty));
      let recountedBy: string | undefined;
      let recountedById: string | undefined;
      if (big.length > 0) {
        const seconds = input.secondCounts ?? [];
        for (const line of big) {
          const found = seconds.find(
            (row) => row.nicheId === line.nicheId && (row.lotId ?? "") === (line.lotId ?? ""),
          );
          if (found == null || !Number.isFinite(found.countedQty)) {
            throw new StockError("Diferença maior que 5: conte de novo antes de lançar.");
          }
          const secondCount = Math.max(0, Math.floor(found.countedQty));
          if (secondCount !== line.countedQty) {
            throw new StockError(
              "A segunda contagem tem que bater com a primeira. Se achou outro valor, corrija o físico e conte de novo.",
            );
          }
          line.secondCount = secondCount;
        }
        const witness = await assertWitness(StockError, { personId: input.recountedById, pin: input.witnessPin });
        recountedBy = witness.recountedBy;
        recountedById = witness.recountedById;
      }

      await db.inventoryCounts.add({
        id: countId,
        locationId: input.locationId,
        at,
        countedBy,
        recountedBy,
        recountedById,
        actorId: actor.actorId,
      });

      const today = todayDate();
      for (const line of diffs) {
        const delta = line.countedQty - line.systemQty;
        let lotId = line.lotId;
        if (lotId) {
          await changeStock(input.locationId, line.nicheId, lotId, delta);
        } else if (delta < 0) {
          const chunks = await oldestLots(input.locationId, line.nicheId, -delta, { skipExpired: true });
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
              actorId: actor.actorId,
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
            .filter(
              (lot): lot is NonNullable<typeof lot> =>
                Boolean(lot) && (!lot.expiresAt || lot.expiresAt >= today),
            )
            .sort((a, b) => b.madeAt.localeCompare(a.madeAt))[0];
          if (newest) {
            lotId = newest.id;
            await changeStock(input.locationId, line.nicheId, newest.id, delta);
          } else {
            lotId = newId();
            await db.lots.add({
              id: lotId,
              nicheId: line.nicheId,
              madeAt: today,
              expiresAt:
                product?.perishable && product.shelfLifeDays > 0
                  ? addDays(today, product.shelfLifeDays)
                  : undefined,
              unitCost: niche?.costPrice ?? 0,
              unitPrice: niche?.sellPrice ?? 0,
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
          actorId: actor.actorId,
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
