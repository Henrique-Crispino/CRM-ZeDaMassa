import { getDb } from "./db";
import { DEFAULT_STORES, refreshLocations } from "./locations";
import { addDays, newId, todayDate } from "./money";
import { createStoreRequest } from "./requests";
import type {
  CashMovement,
  CashSession,
  ConsumeUser,
  Employee,
  InternalAllowance,
  InternalConsumption,
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

function niche(row: Omit<Niche, "promoAllowed" | "promoPrice"> & Partial<Pick<Niche, "promoAllowed" | "promoPrice">>): Niche {
  return {
    promoAllowed: false,
    promoPrice: 0,
    ...row,
  };
}

const CATALOG: { product: Product; niches: Niche[] }[] = [
  {
    product: {
      id: "prod-coxinha",
      name: "Coxinha",
      category: "salgado",
      perishable: true,
      shelfLifeDays: 2,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "cox-mini", productId: "prod-coxinha", name: "Mini", sellPrice: 1.5, costPrice: 0.45, minStock: 30, minStockFactory: 180, minStockStore: 30, active: true, promoAllowed: true, promoPrice: 1.2 }),
      niche({ id: "cox-festa", productId: "prod-coxinha", name: "Festa", sellPrice: 2, costPrice: 0.55, minStock: 20, minStockFactory: 120, minStockStore: 20, active: true }),
      niche({ id: "cox-assado", productId: "prod-coxinha", name: "Assado", sellPrice: 2.5, costPrice: 0.7, minStock: 15, minStockFactory: 80, minStockStore: 15, active: true }),
    ],
  },
  {
    product: {
      id: "prod-risole",
      name: "Risole",
      category: "salgado",
      perishable: true,
      shelfLifeDays: 2,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "ris-mini", productId: "prod-risole", name: "Mini", sellPrice: 1.5, costPrice: 0.4, minStock: 25, minStockFactory: 140, minStockStore: 25, active: true }),
      niche({ id: "ris-festa", productId: "prod-risole", name: "Festa", sellPrice: 2, costPrice: 0.5, minStock: 15, minStockFactory: 90, minStockStore: 15, active: true }),
    ],
  },
  {
    product: {
      id: "prod-kibe",
      name: "Kibe",
      category: "salgado",
      perishable: true,
      shelfLifeDays: 2,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "kibe-mini", productId: "prod-kibe", name: "Mini", sellPrice: 1.8, costPrice: 0.5, minStock: 20, minStockFactory: 100, minStockStore: 20, active: true }),
      niche({ id: "kibe-festa", productId: "prod-kibe", name: "Festa", sellPrice: 2.2, costPrice: 0.6, minStock: 12, minStockFactory: 70, minStockStore: 12, active: true }),
    ],
  },
  {
    product: {
      id: "prod-pastel",
      name: "Pastel de carne",
      category: "salgado",
      perishable: true,
      shelfLifeDays: 1,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "pas-local", productId: "prod-pastel", name: "Consumo local", sellPrice: 8, costPrice: 2.5, minStock: 12, minStockFactory: 80, minStockStore: 12, active: true, promoAllowed: true, promoPrice: 6.5 }),
    ],
  },
  {
    product: {
      id: "prod-coca",
      name: "Coca-Cola 350ml",
      category: "bebida",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "coca-350", productId: "prod-coca", name: "Lata", sellPrice: 6, costPrice: 3.2, minStock: 10, minStockFactory: 40, minStockStore: 10, active: true, promoAllowed: true, promoPrice: 5 }),
    ],
  },
  {
    product: {
      id: "prod-guarana",
      name: "Guaraná 350ml",
      category: "bebida",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "gua-350", productId: "prod-guarana", name: "Lata", sellPrice: 5.5, costPrice: 2.9, minStock: 8, minStockFactory: 35, minStockStore: 8, active: true }),
    ],
  },
  {
    product: {
      id: "prod-detergente",
      name: "Detergente neutro",
      category: "limpeza",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "det-5l", productId: "prod-detergente", name: "Galão 5L", sellPrice: 18, costPrice: 9, minStock: 2, minStockFactory: 8, minStockStore: 2, active: true }),
    ],
  },
  {
    product: {
      id: "prod-copo",
      name: "Copo 200ml",
      category: "descartavel",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "copo-100", productId: "prod-copo", name: "Pacote 100", sellPrice: 8, costPrice: 3.5, minStock: 4, minStockFactory: 16, minStockStore: 4, active: true }),
    ],
  },
  {
    product: {
      id: "prod-marmita",
      name: "Marmita 500ml",
      category: "embalagem",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "marmita-50", productId: "prod-marmita", name: "Pacote 50", sellPrice: 16, costPrice: 7, minStock: 3, minStockFactory: 12, minStockStore: 3, active: true }),
    ],
  },
];

const NICHE_IDS = CATALOG.flatMap((item) => item.niches.map((itemNiche) => itemNiche.id));
const NICHE_BY_ID = new Map(CATALOG.flatMap((item) => item.niches.map((itemNiche) => [itemNiche.id, itemNiche])));
const PRODUCT_BY_NICHE = new Map(
  CATALOG.flatMap((item) => item.niches.map((itemNiche) => [itemNiche.id, item.product])),
);

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
  "det-5l": { produce: 6, store1: 2, store2: 2 },
  "copo-100": { produce: 10, store1: 4, store2: 3 },
  "marmita-50": { produce: 8, store1: 3, store2: 3 },
};

export const DEFAULT_EMPLOYEES: Employee[] = [
  { id: "emp-ana", name: "Ana Souza", storeId: "store_1", active: true },
  { id: "emp-bruno", name: "Bruno Lima", storeId: "store_1", active: true },
  { id: "emp-carla", name: "Carla Mendes", storeId: "store_2", active: true },
  { id: "emp-diego", name: "Diego Alves", storeId: "store_2", active: true },
];

export const DEFAULT_CONSUME_USERS: ConsumeUser[] = [
  { id: "cuser-ana", name: "Ana Souza", login: "ana.souza", password: "1234", locationId: "store_1", active: true },
  { id: "cuser-bruno", name: "Bruno Lima", login: "bruno.lima", password: "1234", locationId: "store_1", active: true },
  { id: "cuser-carla", name: "Carla Mendes", login: "carla.mendes", password: "1234", locationId: "store_2", active: true },
  { id: "cuser-diego", name: "Diego Alves", login: "diego.alves", password: "1234", locationId: "store_2", active: true },
  { id: "cuser-rita", name: "Rita Gomes", login: "rita.gomes", password: "1234", locationId: "factory", active: true },
];

const DEFAULT_ALLOWANCES: InternalAllowance[] = [
  { id: "pas-local", nicheId: "pas-local", enabled: true, dailyLimit: 3 },
  { id: "cox-mini", nicheId: "cox-mini", enabled: true, dailyLimit: 5 },
  { id: "coca-350", nicheId: "coca-350", enabled: true, dailyLimit: 2 },
];

function lotExpiry(nicheId: string, madeAt: string) {
  const product = PRODUCT_BY_NICHE.get(nicheId);
  if (!product?.perishable || product.shelfLifeDays <= 0) return undefined;
  return addDays(madeAt, product.shelfLifeDays);
}

function periodOf(hour: number) {
  return hour < 14 ? "manha" : "tarde";
}

function employeeFor(storeId: string, period: "manha" | "tarde") {
  if (storeId === "store_1") return period === "manha" ? DEFAULT_EMPLOYEES[0] : DEFAULT_EMPLOYEES[1];
  return period === "manha" ? DEFAULT_EMPLOYEES[2] : DEFAULT_EMPLOYEES[3];
}

export async function hasOperationalData() {
  const db = getDb();
  const [products, sales, lots, stock, movements] = await Promise.all([
    db.products.count(),
    db.sales.count(),
    db.lots.count(),
    db.stock.count(),
    db.movements.count(),
  ]);
  return products + sales + lots + stock + movements > 0;
}

export async function ensureDemoData() {
  if (await hasOperationalData()) {
    await ensureAppDefaults();
    return false;
  }
  await loadDemoData();
  return true;
}

export async function ensureAppDefaults() {
  const db = getDb();
  if ((await db.stores.count()) === 0) {
    await db.stores.bulkAdd(DEFAULT_STORES);
  } else {
    const stores = await db.stores.toArray();
    for (const store of stores) {
      const fallback = DEFAULT_STORES.find((item) => item.id === store.id);
      if (!store.address || !store.phone) {
        await db.stores.update(store.id, {
          address: store.address || fallback?.address || "",
          phone: store.phone || fallback?.phone || "",
        });
      }
    }
  }
  if ((await db.employees.count()) === 0) {
    await db.employees.bulkAdd(DEFAULT_EMPLOYEES);
  }
  if ((await db.consumeUsers.count()) === 0) {
    await db.consumeUsers.bulkAdd(DEFAULT_CONSUME_USERS);
  }
  if ((await db.internalAllowances.count()) === 0) {
    const niches = await db.niches.bulkGet(DEFAULT_ALLOWANCES.map((item) => item.nicheId));
    const existing = DEFAULT_ALLOWANCES.filter((_, index) => niches[index]);
    if (existing.length) await db.internalAllowances.bulkAdd(existing);
  }

  const cox = await db.niches.get("cox-mini");
  if (cox && !cox.promoAllowed) {
    await db.niches.update("cox-mini", { promoAllowed: true, promoPrice: 1.2 });
    await db.niches.update("coca-350", { promoAllowed: true, promoPrice: 5 });
    await db.niches.update("pas-local", { promoAllowed: true, promoPrice: 6.5 });
  }

  const today = todayDate();
  const open = (await db.cashSessions.toArray()).filter((row) => !row.closedAt);
  if (open.length === 0) {
    const employees = await db.employees.toArray();
    const stores = (await db.stores.toArray()).filter((store) => store.active);
    for (const store of stores) {
      const employee = employees.find((item) => item.active && item.storeId === store.id);
      if (!employee) continue;
      await db.cashSessions.add({
        id: `cash-${store.id}-${today}-manha`,
        locationId: store.id,
        period: "manha",
        employeeId: employee.id,
        employeeName: employee.name,
        openedAt: new Date(`${today}T08:00:00`).toISOString(),
        openingAmount: 150,
      });
    }
  }

  const extras = CATALOG.filter((item) =>
    ["limpeza", "descartavel", "embalagem"].includes(item.product.category),
  );
  for (const item of extras) {
    if (!(await db.products.get(item.product.id))) {
      await db.products.add(item.product);
      await db.niches.bulkAdd(item.niches);
    }
  }

  const products = await db.products.toArray();
  const niches = await db.niches.toArray();
  const productByNiche = new Map(
    niches.map((item) => [item.id, products.find((product) => product.id === item.productId)]),
  );
  const lots = await db.lots.toArray();
  for (const lot of lots) {
    if (lot.expiresAt) continue;
    const product = productByNiche.get(lot.nicheId);
    if (product?.perishable && product.shelfLifeDays > 0) {
      await db.lots.update(lot.id, { expiresAt: addDays(lot.madeAt, product.shelfLifeDays) });
    }
    if (product && product.perishable === undefined) {
      await db.products.update(product.id, {
        perishable: product.category === "salgado",
        shelfLifeDays: product.category === "salgado" ? 2 : 0,
      });
    }
  }

  await refreshLocations();
}

export async function loadDemoData() {
  if (await hasOperationalData()) {
    throw new Error("Este computador já tem dados. O exemplo só entra numa base vazia.");
  }

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
  const cashSessions = new Map<string, CashSession>();
  const cashMovements: CashMovement[] = [];
  const consumptions: InternalConsumption[] = [];

  function stockKey(locationId: string, nicheId: string, lotId: string) {
    return `${locationId}:${nicheId}:${lotId}`;
  }

  function addStock(locationId: string, nicheId: string, lotId: string, qty: number) {
    const id = stockKey(locationId, nicheId, lotId);
    const row = stock.get(id);
    const nextQty = (row?.qty ?? 0) + qty;
    if (nextQty <= 0) stock.delete(id);
    else stock.set(id, { id, locationId, nicheId, lotId, qty: nextQty });
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
        const lotA = lots.find((lot) => lot.id === a.lotId);
        const lotB = lots.find((lot) => lot.id === b.lotId);
        return (lotA?.expiresAt ?? lotA?.madeAt ?? "").localeCompare(lotB?.expiresAt ?? lotB?.madeAt ?? "");
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

  function ensureSession(storeId: string, daysAgo: number, period: "manha" | "tarde") {
    const madeAt = dateKey(daysAgo);
    const id = `cash-${storeId}-${madeAt}-${period}`;
    if (!cashSessions.has(id)) {
      const employee = employeeFor(storeId, period);
      const openHour = period === "manha" ? 8 : 14;
      const today = daysAgo === 0 && period === "manha";
      cashSessions.set(id, {
        id,
        locationId: storeId,
        period,
        employeeId: employee?.id ?? "emp-ana",
        employeeName: employee?.name ?? "Ana Souza",
        openedAt: dayAt(daysAgo, openHour, 0).toISOString(),
        closedAt: today ? undefined : dayAt(daysAgo, period === "manha" ? 13 : 21, 40).toISOString(),
        openingAmount: period === "manha" ? 150 : 80,
        closingAmount: today ? undefined : between(rng, 180, 420),
      });
    }
    return id;
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
      lots.push({ id: lotId, nicheId, madeAt, expiresAt: lotExpiry(nicheId, madeAt) });
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
      ensureSession(storeId, daysAgo, "manha");
      if (!today) ensureSession(storeId, daysAgo, "tarde");
      const busier = storeId === "store_1" ? 1.15 : 0.9;
      const tickets = Math.round((weekend ? 18 : 12) * busier * (today ? 1.1 : 1));

      for (let ticket = 0; ticket < tickets; ticket += 1) {
        const hour = between(rng, 9, today ? 13 : 19);
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
          const itemNiche = NICHE_BY_ID.get(nicheId);
          if (!itemNiche || qty <= 0) continue;
          const usePromo = itemNiche.promoAllowed && between(rng, 1, 5) === 1;
          const unitPrice = usePromo ? itemNiche.promoPrice : itemNiche.sellPrice;
          for (const chunk of take(storeId, nicheId, qty)) {
            lines.push({
              id: newId(),
              saleId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              unitPrice,
              unitCost: itemNiche.costPrice,
              promo: usePromo,
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
        sales.push({
          id: saleId,
          locationId: storeId,
          channel,
          payment,
          total,
          at,
          cashSessionId: ensureSession(storeId, daysAgo, periodOf(hour)),
        });
        saleItems.push(...lines);
      }

      if (weekday !== 1 && available(storeId, "pas-local") > 2) {
        const consumeAt = dayAt(daysAgo, 11, 20).toISOString();
        const qty = Math.min(2, available(storeId, "pas-local"));
        for (const chunk of take(storeId, "pas-local", qty)) {
          const consumer = storeId === "store_1" ? DEFAULT_CONSUME_USERS[0] : DEFAULT_CONSUME_USERS[2];
          consumptions.push({
            id: newId(),
            locationId: storeId,
            nicheId: "pas-local",
            lotId: chunk.lotId,
            qty: chunk.qty,
            at: consumeAt,
            dayKey: madeAt,
            userId: consumer?.id,
            userName: consumer?.name,
          });
          movements.push({
            id: newId(),
            locationId: storeId,
            nicheId: "pas-local",
            lotId: chunk.lotId,
            qty: -chunk.qty,
            type: "internal",
            refId: `cons-${storeId}-${madeAt}`,
            at: consumeAt,
          });
        }
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
          const itemNiche = NICHE_BY_ID.get(nicheId);
          if (!itemNiche || qty <= 0) continue;
          for (const chunk of take(storeId, nicheId, qty)) {
            wastes.push({
              id: newId(),
              locationId: storeId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              reason: "sobra_frito",
              at: wasteHour,
              unitCost: itemNiche.costPrice,
              unitPrice: itemNiche.sellPrice,
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

  const expiredMade = dateKey(4);
  lots.push({
    id: "lot-expired-cox",
    nicheId: "cox-mini",
    madeAt: expiredMade,
    expiresAt: addDays(expiredMade, 2),
  });
  addStock("store_1", "cox-mini", "lot-expired-cox", 12);

  for (const session of cashSessions.values()) {
    const sessionSales = sales.filter((sale) => sale.cashSessionId === session.id);
    const cashSales = sessionSales.filter((sale) => sale.payment === "dinheiro").reduce((sum, sale) => sum + sale.total, 0);
    const pixSales = sessionSales.filter((sale) => sale.payment === "pix").reduce((sum, sale) => sum + sale.total, 0);
    const cardSales = sessionSales.filter((sale) => sale.payment === "cartao").reduce((sum, sale) => sum + sale.total, 0);
    session.cashSales = Math.round(cashSales * 100) / 100;
    session.pixSales = Math.round(pixSales * 100) / 100;
    session.cardSales = Math.round(cardSales * 100) / 100;
    if (!session.closedAt) continue;
    const sangria = cashSales > 120 ? Math.round(cashSales * 40) / 100 : 0;
    if (sangria > 0) {
      cashMovements.push({
        id: `sangria-${session.id}`,
        sessionId: session.id,
        locationId: session.locationId,
        type: "sangria",
        amount: sangria,
        reason: "Recolhimento ao cofre",
        at: session.closedAt,
      });
    }
    const expected = Math.round((session.openingAmount + cashSales - sangria) * 100) / 100;
    const difference = Math.round(between(rng, -6, 5) * 100) / 100;
    session.sangriaTotal = sangria;
    session.supplyTotal = 0;
    session.expectedAmount = expected;
    session.difference = difference;
    session.closingAmount = Math.max(0, Math.round((expected + difference) * 100) / 100);
    if (difference < -1) session.note = "Quebra registrada na conferência.";
    if (difference > 1) session.note = "Sobra registrada na conferência.";
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
      db.stores,
      db.employees,
      db.cashSessions,
      db.internalAllowances,
      db.settings,
      db.consumptions,
      db.consumeUsers,
      db.cashMovements,
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
        db.stores.clear(),
        db.employees.clear(),
        db.cashSessions.clear(),
        db.internalAllowances.clear(),
        db.settings.clear(),
        db.consumptions.clear(),
        db.consumeUsers.clear(),
        db.cashMovements.clear(),
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
      await db.stores.bulkAdd(DEFAULT_STORES);
      await db.employees.bulkAdd(DEFAULT_EMPLOYEES);
      await db.cashSessions.bulkAdd([...cashSessions.values()]);
      await db.internalAllowances.bulkAdd(DEFAULT_ALLOWANCES);
      await db.consumeUsers.bulkAdd(DEFAULT_CONSUME_USERS);
      await db.consumptions.bulkAdd(consumptions);
      if (cashMovements.length) await db.cashMovements.bulkAdd(cashMovements);
    },
  );

  await refreshLocations();

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
