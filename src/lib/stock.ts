import { getDb } from "./db";
import { newId } from "./money";
import type { PaymentMethod, SaleChannel } from "./types";

export class StockError extends Error {}

function stockKey(locationId: string, nicheId: string, lotId: string) {
  return `${locationId}:${nicheId}:${lotId}`;
}

async function changeStock(
  locationId: string,
  nicheId: string,
  lotId: string,
  qty: number,
) {
  const db = getDb();
  const id = stockKey(locationId, nicheId, lotId);
  const current = await db.stock.get(id);
  const next = (current?.qty ?? 0) + qty;
  if (next < 0) {
    throw new StockError("Não tem quantidade suficiente no estoque.");
  }
  if (next === 0) {
    if (current) await db.stock.delete(id);
    return;
  }
  await db.stock.put({ id, locationId, nicheId, lotId, qty: next });
}

async function oldestLots(locationId: string, nicheId: string, qty: number) {
  const db = getDb();
  const rows = (await db.stock.where("[locationId+nicheId]").equals([locationId, nicheId]).toArray())
    .filter((row) => row.qty > 0);

  const lots = await db.lots.bulkGet(rows.map((row) => row.lotId));
  const ordered = rows
    .map((row, index) => ({ row, madeAt: lots[index]?.madeAt ?? "9999-12-31" }))
    .sort((a, b) => a.madeAt.localeCompare(b.madeAt));

  let missing = qty;
  const taken: { lotId: string; qty: number }[] = [];
  for (const item of ordered) {
    if (missing <= 0) break;
    const use = Math.min(item.row.qty, missing);
    taken.push({ lotId: item.row.lotId, qty: use });
    missing -= use;
  }

  if (missing > 0) {
    throw new StockError("Não tem quantidade suficiente no estoque.");
  }
  return taken;
}

export async function stockQty(locationId: string, nicheId: string) {
  const rows = await getDb()
    .stock.where("[locationId+nicheId]")
    .equals([locationId, nicheId])
    .toArray();
  return rows.reduce((sum, row) => sum + row.qty, 0);
}

export async function produceItems(input: {
  items: { nicheId: string; qty: number }[];
  madeAt: string;
}) {
  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Informe quantos salgados ou bebidas foram feitos.");
  }

  const db = getDb();
  const refId = newId();
  const at = new Date().toISOString();

  await db.transaction("rw", [db.lots, db.stock, db.movements], async () => {
    for (const item of items) {
      const lotId = newId();
      await db.lots.add({ id: lotId, nicheId: item.nicheId, madeAt: input.madeAt });
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
  if (input.toLocationId === "factory") {
    throw new StockError("Escolha a Loja 1 ou a Loja 2.");
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
        const chunks = await oldestLots("factory", item.nicheId, item.qty);
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
  items: { nicheId: string; qty: number }[];
}) {
  if (input.locationId === "factory") {
    throw new StockError("A venda é feita na loja, não na fábrica.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new StockError("Coloque pelo menos um item na venda.");
  }

  const db = getDb();
  const saleId = newId();
  const at = new Date().toISOString();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.sales, db.saleItems, db.niches],
    async () => {
      let total = 0;

      for (const [index, item] of items.entries()) {
        const niche = niches[index];
        if (!niche) throw new StockError("Produto não encontrado.");
        const chunks = await oldestLots(input.locationId, item.nicheId, item.qty);
        for (const chunk of chunks) {
          await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
          await db.saleItems.add({
            id: newId(),
            saleId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
            unitPrice: niche.sellPrice,
            unitCost: niche.costPrice,
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
          total += chunk.qty * niche.sellPrice;
        }
      }

      await db.sales.add({
        id: saleId,
        locationId: input.locationId,
        channel: input.channel,
        payment: input.payment,
        total,
        at,
      });
    },
  );

  return saleId;
}

export async function registerWaste(input: {
  locationId: string;
  items: { nicheId: string; qty: number }[];
}) {
  if (input.locationId === "factory") {
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
      const chunks = await oldestLots(input.locationId, item.nicheId, item.qty);
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
