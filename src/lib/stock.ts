import { currentCashSession } from "./cash";
import { getDb } from "./db";
import { isStore } from "./locations";
import { addDays, newId, todayDate } from "./money";
import { changeStock, oldestLots, StockError, stockQty } from "./stock-core";
import type { PaymentMethod, SaleChannel } from "./types";

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

export async function sendToStore(input: {
  toLocationId: string;
  items: { nicheId: string; qty: number }[];
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
      });

      for (const item of items) {
        const chunks = await oldestLots("factory", item.nicheId, item.qty, { skipExpired: true });
        for (const chunk of chunks) {
          await changeStock("factory", item.nicheId, chunk.lotId, -chunk.qty);
          await changeStock(input.toLocationId, item.nicheId, chunk.lotId, chunk.qty);
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
          await db.movements.add({
            id: newId(),
            locationId: input.toLocationId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
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

export async function checkout(input: {
  locationId: string;
  channel: SaleChannel;
  payment: PaymentMethod;
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
        const usePromo = Boolean(item.promo && niche.promoAllowed && niche.promoPrice > 0);
        if (item.promo && !usePromo) {
          throw new StockError(`${niche.name} não está liberado para promoção.`);
        }
        const unitPrice = usePromo ? niche.promoPrice : niche.sellPrice;
        const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, { skipExpired: true });
        for (const chunk of chunks) {
          await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
          await db.saleItems.add({
            id: newId(),
            saleId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
            unitPrice,
            unitCost: niche.costPrice,
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

      await db.sales.add({
        id: saleId,
        locationId: input.locationId,
        channel: input.channel,
        payment: input.payment,
        total,
        at,
        cashSessionId: session.id,
      });
    },
  );

  return saleId;
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
        await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
        await db.wastes.add({
          id: newId(),
          locationId: input.locationId,
          nicheId: item.nicheId,
          lotId: chunk.lotId,
          qty: chunk.qty,
          reason: "sobra_frito",
          at,
          unitCost: niche?.costPrice ?? 0,
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
        unitCost: niche?.costPrice ?? 0,
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
