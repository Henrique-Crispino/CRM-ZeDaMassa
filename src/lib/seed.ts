import { getDb } from "./db";
import { newId } from "./money";
import { createStoreRequest } from "./requests";
import type {
  Lot,
  Movement,
  Niche,
  Product,
  Sale,
  SaleItem,
  StockRow,
  Transfer,
  TransferItem,
  Waste,
} from "./types";

type Rng = { n: number };

function next(rng: Rng) {
  rng.n = (rng.n * 16807) % 2147483647;
  return rng.n;
}

function between(rng: Rng, min: number, max: number) {
  return min + (next(rng) % (max - min + 1));
}

function pick<T>(rng: Rng, items: T[]) {
  return items[between(rng, 0, items.length - 1)] as T;
}

function dayAt(daysAgo: number, hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function dateKey(daysAgo: number) {
  const date = dayAt(daysAgo, 12);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const CATALOG: { product: Product; niches: Niche[] }[] = [
  {
    product: { id: "prod-coxinha", name: "Coxinha", category: "salgado", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "cox-mini", productId: "prod-coxinha", name: "Mini", sellPrice: 1.5, costPrice: 0.45, minStock: 30, minStockFactory: 180, minStockStore: 30, active: true },
      { id: "cox-festa", productId: "prod-coxinha", name: "Festa", sellPrice: 2, costPrice: 0.55, minStock: 20, minStockFactory: 120, minStockStore: 20, active: true },
      { id: "cox-assado", productId: "prod-coxinha", name: "Assado", sellPrice: 2.5, costPrice: 0.7, minStock: 15, minStockFactory: 80, minStockStore: 15, active: true },
    ],
  },
  {
    product: { id: "prod-risole", name: "Risole", category: "salgado", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "ris-mini", productId: "prod-risole", name: "Mini", sellPrice: 1.5, costPrice: 0.4, minStock: 25, minStockFactory: 140, minStockStore: 25, active: true },
      { id: "ris-festa", productId: "prod-risole", name: "Festa", sellPrice: 2, costPrice: 0.5, minStock: 15, minStockFactory: 90, minStockStore: 15, active: true },
    ],
  },
  {
    product: { id: "prod-kibe", name: "Kibe", category: "salgado", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "kibe-mini", productId: "prod-kibe", name: "Mini", sellPrice: 1.8, costPrice: 0.5, minStock: 20, minStockFactory: 100, minStockStore: 20, active: true },
      { id: "kibe-festa", productId: "prod-kibe", name: "Festa", sellPrice: 2.2, costPrice: 0.6, minStock: 12, minStockFactory: 70, minStockStore: 12, active: true },
    ],
  },
  {
    product: { id: "prod-pastel", name: "Pastel de carne", category: "salgado", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "pas-local", productId: "prod-pastel", name: "Consumo local", sellPrice: 8, costPrice: 2.5, minStock: 12, minStockFactory: 80, minStockStore: 12, active: true },
    ],
  },
  {
    product: { id: "prod-coca", name: "Coca-Cola 350ml", category: "bebida", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "coca-350", productId: "prod-coca", name: "Lata", sellPrice: 6, costPrice: 3.2, minStock: 10, minStockFactory: 40, minStockStore: 10, active: true },
    ],
  },
  {
    product: { id: "prod-guarana", name: "Guaraná 350ml", category: "bebida", createdAt: "2026-07-01T10:00:00.000Z" },
    niches: [
      { id: "gua-350", productId: "prod-guarana", name: "Lata", sellPrice: 5.5, costPrice: 2.9, minStock: 8, minStockFactory: 35, minStockStore: 8, active: true },
    ],
  },
];

const NICHE_IDS = CATALOG.flatMap((item) => item.niches.map((niche) => niche.id));
const NICHE_BY_ID = new Map(CATALOG.flatMap((item) => item.niches.map((niche) => [niche.id, niche])));

const PLAN: Record<string, { produce: number; store1: number; store2: number }> = {
  "cox-mini": { produce: 360, store1: 175, store2: 155 },
  "cox-festa": { produce: 160, store1: 75, store2: 60 },
  "cox-assado": { produce: 90, store1: 40, store2: 35 },
  "ris-mini": { produce: 240, store1: 110, store2: 100 },
  "ris-festa": { produce: 110, store1: 50, store2: 40 },
  "kibe-mini": { produce: 170, store1: 80, store2: 70 },
  "kibe-festa": { produce: 80, store1: 35, store2: 30 },
  "pas-local": { produce: 55, store1: 26, store2: 22 },
  "coca-350": { produce: 48, store1: 22, store2: 18 },
  "gua-350": { produce: 40, store1: 18, store2: 15 },
};

export async function ensureDemoData() {
  const sales = await getDb().sales.count();
  if (sales > 0) return false;
  await loadDemoData();
  return true;
}

export async function loadDemoData() {
  const db = getDb();
  const rng: Rng = { n: 42 };
  const lots: Lot[] = [];
  const stock = new Map<string, StockRow>();
  const movements: Movement[] = [];
  const transfers: Transfer[] = [];
  const transferItems: TransferItem[] = [];
  const sales: Sale[] = [];
  const saleItems: SaleItem[] = [];
  const wastes: Waste[] = [];

  function stockKey(locationId: string, nicheId: string, lotId: string) {
    return `${locationId}:${nicheId}:${lotId}`;
  }

  function addStock(locationId: string, nicheId: string, lotId: string, qty: number) {
    const id = stockKey(locationId, nicheId, lotId);
    const row = stock.get(id);
    const next = (row?.qty ?? 0) + qty;
    if (next <= 0) stock.delete(id);
    else stock.set(id, { id, locationId, nicheId, lotId, qty: next });
  }

  function available(locationId: string, nicheId: string) {
    let total = 0;
    for (const row of stock.values()) {
      if (row.locationId === locationId && row.nicheId === nicheId) total += row.qty;
    }
    return total;
  }

  function take(locationId: string, nicheId: string, qty: number) {
    const rows = [...stock.values()]
      .filter((row) => row.locationId === locationId && row.nicheId === nicheId && row.qty > 0)
      .sort((a, b) => {
        const lotA = lots.find((lot) => lot.id === a.lotId)?.madeAt ?? "";
        const lotB = lots.find((lot) => lot.id === b.lotId)?.madeAt ?? "";
        return lotA.localeCompare(lotB);
      });

    let missing = Math.min(qty, rows.reduce((sum, row) => sum + row.qty, 0));
    const chunks: { lotId: string; qty: number }[] = [];
    for (const row of rows) {
      if (missing <= 0) break;
      const use = Math.min(row.qty, missing);
      addStock(locationId, nicheId, row.lotId, -use);
      chunks.push({ lotId: row.lotId, qty: use });
      missing -= use;
    }
    return chunks;
  }

  for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
    const madeAt = dateKey(daysAgo);
    const weekday = dayAt(daysAgo, 12).getDay();
    const weekend = weekday === 0 || weekday === 6;
    const today = daysAgo === 0;
    const producedAt = dayAt(daysAgo, 7, 30).toISOString();
    const sentAt = dayAt(daysAgo, 8, 10).toISOString();

    for (const nicheId of NICHE_IDS) {
      const plan = PLAN[nicheId];
      if (!plan) continue;
      const lotId = `lot-${nicheId}-${madeAt}`;
      lots.push({ id: lotId, nicheId, madeAt });
      addStock("factory", nicheId, lotId, plan.produce);
      movements.push({
        id: newId(),
        locationId: "factory",
        nicheId,
        lotId,
        qty: plan.produce,
        type: "production",
        refId: `prod-${madeAt}`,
        at: producedAt,
      });
    }

    for (const [toLocationId, field] of [
      ["store_1", "store1"],
      ["store_2", "store2"],
    ] as const) {
      const sendCut = today && toLocationId === "store_2" ? 0.35 : today ? 0.7 : 1;
      const transferId = `tr-${toLocationId}-${madeAt}`;
      transfers.push({
        id: transferId,
        fromLocationId: "factory",
        toLocationId,
        at: sentAt,
      });

      for (const nicheId of NICHE_IDS) {
        const plan = PLAN[nicheId];
        if (!plan) continue;
        let qty = Math.round(plan[field] * sendCut);
        if (today && nicheId === "cox-festa") qty = Math.round(qty * 0.2);
        if (today && nicheId === "pas-local") qty = Math.round(qty * 0.25);
        if (today && toLocationId === "store_2" && (nicheId === "kibe-mini" || nicheId === "coca-350")) {
          qty = Math.max(2, Math.round(qty * 0.15));
        }
        const chunks = take("factory", nicheId, qty);
        for (const chunk of chunks) {
          addStock(toLocationId, nicheId, chunk.lotId, chunk.qty);
          transferItems.push({
            id: newId(),
            transferId,
            nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
          });
          movements.push(
            {
              id: newId(),
              locationId: "factory",
              nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "send",
              refId: transferId,
              at: sentAt,
            },
            {
              id: newId(),
              locationId: toLocationId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              type: "send",
              refId: transferId,
              at: sentAt,
            },
          );
        }
      }
    }

    for (const storeId of ["store_1", "store_2"] as const) {
      const busier = storeId === "store_1" ? 1.15 : 0.9;
      const tickets = Math.round((weekend ? 18 : 12) * busier * (today ? 1.1 : 1));

      for (let ticket = 0; ticket < tickets; ticket += 1) {
        const hour = between(rng, 9, 19);
        const at = dayAt(daysAgo, hour, between(rng, 0, 59)).toISOString();
        const saleId = newId();
        const channel = pick(rng, [
          "caixa",
          "caixa",
          "caixa",
          "caixa",
          "delivery",
          "delivery",
          "encomenda",
        ] as const);
        const payment = pick(rng, ["pix", "pix", "pix", "cartao", "cartao", "dinheiro"] as const);
        const itemCount = between(rng, 1, 4);
        const used = new Set<string>();
        const lines: SaleItem[] = [];

        for (let i = 0; i < itemCount; i += 1) {
          const popular = today
            ? ["cox-mini", "cox-festa", "ris-mini", "pas-local", "kibe-mini", "coca-350"]
            : ["cox-mini", "cox-mini", "ris-mini", "kibe-mini", "coca-350", "cox-festa"];
          const nicheId = pick(rng, popular);
          if (used.has(nicheId)) continue;
          used.add(nicheId);
          const have = available(storeId, nicheId);
          if (have <= 0) continue;
          const want = between(rng, 2, storeId === "store_1" ? 10 : 8);
          const qty = Math.min(have, today && ["cox-festa", "pas-local", "kibe-mini", "coca-350"].includes(nicheId) ? Math.max(want, Math.ceil(have * 0.45)) : want);
          const niche = NICHE_BY_ID.get(nicheId);
          if (!niche || qty <= 0) continue;
          for (const chunk of take(storeId, nicheId, qty)) {
            lines.push({
              id: newId(),
              saleId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              unitPrice: niche.sellPrice,
              unitCost: niche.costPrice,
            });
            movements.push({
              id: newId(),
              locationId: storeId,
              nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "sale",
              refId: saleId,
              at,
            });
          }
        }

        if (lines.length === 0) continue;
        const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
        sales.push({ id: saleId, locationId: storeId, channel, payment, total, at });
        saleItems.push(...lines);
      }

      if (weekday !== 1) {
        const wasteHour = dayAt(daysAgo, 21, 10).toISOString();
        const wasteItems = storeId === "store_1"
          ? (["cox-mini", "ris-mini", "cox-assado"] as const)
          : (["cox-mini", "kibe-mini", "pas-local"] as const);

        for (const nicheId of wasteItems) {
          const have = available(storeId, nicheId);
          if (have < 4) continue;
          const qty = Math.min(have - 1, today ? between(rng, 8, 18) : between(rng, 3, 9));
          const niche = NICHE_BY_ID.get(nicheId);
          if (!niche || qty <= 0) continue;
          for (const chunk of take(storeId, nicheId, qty)) {
            wastes.push({
              id: newId(),
              locationId: storeId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              reason: "sobra_frito",
              at: wasteHour,
              unitCost: niche.costPrice,
              unitPrice: niche.sellPrice,
            });
            movements.push({
              id: newId(),
              locationId: storeId,
              nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "waste",
              refId: `waste-${storeId}-${madeAt}`,
              at: wasteHour,
            });
          }
        }
      }
    }
  }

  const products = CATALOG.map((item) => item.product);
  const niches = CATALOG.flatMap((item) => item.niches);

  await db.transaction(
    "rw",
    [
      db.products,
      db.niches,
      db.lots,
      db.stock,
      db.movements,
      db.transfers,
      db.transferItems,
      db.sales,
      db.saleItems,
      db.wastes,
      db.requests,
      db.requestItems,
      db.notifications,
    ],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.niches.clear(),
        db.lots.clear(),
        db.stock.clear(),
        db.movements.clear(),
        db.transfers.clear(),
        db.transferItems.clear(),
        db.sales.clear(),
        db.saleItems.clear(),
        db.wastes.clear(),
        db.requests.clear(),
        db.requestItems.clear(),
        db.notifications.clear(),
      ]);
      await db.products.bulkAdd(products);
      await db.niches.bulkAdd(niches);
      await db.lots.bulkAdd(lots);
      await db.stock.bulkAdd([...stock.values()]);
      await db.movements.bulkAdd(movements);
      await db.transfers.bulkAdd(transfers);
      await db.transferItems.bulkAdd(transferItems);
      await db.sales.bulkAdd(sales);
      await db.saleItems.bulkAdd(saleItems);
      await db.wastes.bulkAdd(wastes);
    },
  );

  await createStoreRequest({
    fromLocationId: "store_1",
    note: "Sábado tem encomenda grande.",
    items: [
      { nicheId: "cox-festa", qty: 80 },
      { nicheId: "pas-local", qty: 25 },
    ],
  });
  await createStoreRequest({
    fromLocationId: "store_2",
    note: "Acabando o refrigerante.",
    items: [{ nicheId: "coca-350", qty: 24 }],
  });
}
