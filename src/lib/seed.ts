import { CASH_REOPEN_CODE, CASH_REOPEN_SETTING } from "./cash";
import { getDb } from "./db";
import { asConsumeUser, mergePeopleIfNeeded, personCanConsume } from "./people";
import { DEFAULT_STORES, refreshLocations } from "./locations";
import { addDays, endOfDayIso, newId, startOfDayIso, todayDate } from "./money";
import { createStoreRequest } from "./requests";
import type {
  CashMovement,
  CashSession,
  Combo,
  ComboItem,
  ConsumeGroup,
  ConsumeUser,
  Customer,
  Employee,
  InternalAllowance,
  InternalConsumption,
  Lot,
  Movement,
  Niche,
  Product,
  Sale,
  SaleItem,
  SalePayment,
  StockRow,
  Transfer,
  TransferItem,
  Waste,
} from "./types";
import { promoIsLive, salePaymentShare } from "./types";

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

function niche(
  row: Omit<Niche, "promoAllowed" | "promoPrice"> &
    Partial<Pick<Niche, "promoAllowed" | "promoPrice" | "promoFrom" | "promoTo" | "promoOnlyExpiringToday">>,
): Niche {
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
      niche({ id: "cox-mini", productId: "prod-coxinha", name: "Mini", sellPrice: 1.5, costPrice: 0.45, minStock: 30, minStockFactory: 80, minStockStore: 35, active: true, promoAllowed: true, promoPrice: 1.2, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) }),
      niche({ id: "cox-festa", productId: "prod-coxinha", name: "Festa", sellPrice: 2, costPrice: 0.55, minStock: 20, minStockFactory: 40, minStockStore: 18, active: true }),
      niche({ id: "cox-assado", productId: "prod-coxinha", name: "Assado", sellPrice: 2.5, costPrice: 0.7, minStock: 15, minStockFactory: 30, minStockStore: 12, active: true }),
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
      niche({ id: "ris-mini", productId: "prod-risole", name: "Mini", sellPrice: 1.5, costPrice: 0.4, minStock: 25, minStockFactory: 50, minStockStore: 22, active: true }),
      niche({ id: "ris-festa", productId: "prod-risole", name: "Festa", sellPrice: 2, costPrice: 0.5, minStock: 15, minStockFactory: 28, minStockStore: 12, active: true }),
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
      niche({ id: "kibe-mini", productId: "prod-kibe", name: "Mini", sellPrice: 1.8, costPrice: 0.5, minStock: 20, minStockFactory: 40, minStockStore: 18, active: true }),
      niche({ id: "kibe-festa", productId: "prod-kibe", name: "Festa", sellPrice: 2.2, costPrice: 0.6, minStock: 12, minStockFactory: 22, minStockStore: 10, active: true }),
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
      niche({ id: "pas-local", productId: "prod-pastel", name: "Consumo local", sellPrice: 8, costPrice: 2.5, minStock: 12, minStockFactory: 24, minStockStore: 10, active: true, promoAllowed: true, promoPrice: 6.5, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) }),
    ],
  },
  {
    product: {
      id: "prod-coca",
      name: "Coca-Cola 350ml",
      category: "bebida",
      perishable: true,
      shelfLifeDays: 180,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "coca-350", productId: "prod-coca", name: "Lata", sellPrice: 6, costPrice: 3.2, minStock: 10, minStockFactory: 40, minStockStore: 10, active: true, promoAllowed: true, promoPrice: 5, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) }),
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
  {
    product: {
      id: "prod-farinha",
      name: "Farinha de trigo",
      category: "insumo",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "farinha-25kg", productId: "prod-farinha", name: "Saco 25kg", sellPrice: 85, costPrice: 85, minStock: 2, minStockFactory: 6, minStockStore: 0, active: true }),
    ],
  },
  {
    product: {
      id: "prod-oleo",
      name: "Óleo de soja",
      category: "insumo",
      perishable: false,
      shelfLifeDays: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
    niches: [
      niche({ id: "oleo-18l", productId: "prod-oleo", name: "Lata 18L", sellPrice: 95, costPrice: 95, minStock: 1, minStockFactory: 4, minStockStore: 0, active: true }),
    ],
  },
];

const NICHE_IDS = CATALOG.flatMap((item) => item.niches.map((itemNiche) => itemNiche.id));
const NICHE_BY_ID = new Map(CATALOG.flatMap((item) => item.niches.map((itemNiche) => [itemNiche.id, itemNiche])));
const PRODUCT_BY_NICHE = new Map(
  CATALOG.flatMap((item) => item.niches.map((itemNiche) => [itemNiche.id, item.product])),
);

const PLAN: Record<string, { produce: number; store1: number; store2: number }> = {
  "cox-mini": { produce: 180, store1: 90, store2: 80 },
  "cox-festa": { produce: 66, store1: 32, store2: 28 },
  "cox-assado": { produce: 38, store1: 18, store2: 16 },
  "ris-mini": { produce: 110, store1: 55, store2: 48 },
  "ris-festa": { produce: 46, store1: 22, store2: 20 },
  "kibe-mini": { produce: 82, store1: 40, store2: 36 },
  "kibe-festa": { produce: 34, store1: 16, store2: 14 },
  "pas-local": { produce: 34, store1: 16, store2: 14 },
  "coca-350": { produce: 40, store1: 18, store2: 16 },
  "gua-350": { produce: 30, store1: 14, store2: 12 },
  "det-5l": { produce: 3, store1: 1, store2: 1 },
  "copo-100": { produce: 5, store1: 2, store2: 2 },
  "marmita-50": { produce: 3, store1: 1, store2: 1 },
  "farinha-25kg": { produce: 6, store1: 0, store2: 0 },
  "oleo-18l": { produce: 4, store1: 0, store2: 0 },
};

export const DEFAULT_EMPLOYEES: Employee[] = [
  { id: "emp-ana", name: "Ana Souza", storeId: "store_1", locationId: "store_1", podeCaixa: true, podeConsumo: true, login: "ana.souza", password: "1234", active: true },
  { id: "emp-bruno", name: "Bruno Lima", storeId: "store_1", locationId: "store_1", podeCaixa: true, podeConsumo: true, login: "bruno.lima", password: "1234", active: true },
  { id: "emp-carla", name: "Carla Mendes", storeId: "store_2", locationId: "store_2", podeCaixa: true, podeConsumo: true, login: "carla.mendes", password: "1234", active: true },
  { id: "emp-diego", name: "Diego Alves", storeId: "store_2", locationId: "store_2", podeCaixa: true, podeConsumo: true, login: "diego.alves", password: "1234", active: true },
  { id: "emp-rita", name: "Rita Gomes", storeId: "", locationId: "factory", podeCaixa: false, podeConsumo: true, login: "rita.gomes", password: "1234", active: true },
];

export const DEFAULT_CONSUME_USERS: ConsumeUser[] = DEFAULT_EMPLOYEES.filter(personCanConsume).map(asConsumeUser);

const DEFAULT_ALLOWANCES: InternalAllowance[] = [
  { id: "pas-local", nicheId: "pas-local", enabled: true, dailyLimit: 10, personLimit: 3 },
  { id: "cox-mini", nicheId: "cox-mini", enabled: true, dailyLimit: 5, personLimit: 2 },
  { id: "coca-350", nicheId: "coca-350", enabled: true, dailyLimit: 2, personLimit: 1 },
];

export const DEFAULT_CONSUME_GROUPS: ConsumeGroup[] = [
  {
    id: "grp-salgado-local",
    name: "Salgados locais",
    enabled: true,
    personLimit: 3,
    nicheIds: ["pas-local", "cox-mini", "kibe-mini", "ris-mini"],
  },
];

export const DEFAULT_COMBOS: Combo[] = [
  {
    id: "combo-10mini-coca",
    name: "10 mini + Coca",
    price: 18,
    enabled: true,
    promoFrom: startOfDayIso(),
    promoTo: endOfDayIso(addDays(todayDate(), 14)),
  },
];

export const DEFAULT_COMBO_ITEMS: ComboItem[] = [
  { id: "combo-10mini-coca-cox", comboId: "combo-10mini-coca", nicheId: "cox-mini", qty: 10 },
  { id: "combo-10mini-coca-coca", comboId: "combo-10mini-coca", nicheId: "coca-350", qty: 1 },
];

export const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: "cust-marcia",
    name: "Dona Márcia",
    phone: "(11) 98888-1010",
    note: "Festa sábado. Retirada na fábrica.",
    address: "",
    kind: "festa",
    active: true,
    createdAt: `${todayDate()}T10:00:00.000Z`,
  },
  {
    id: "cust-padaria-ze",
    name: "Padaria do Zé",
    phone: "(11) 97777-2020",
    note: "Compra grande. Retira na câmara.",
    address: "Rua do Forno, 40",
    kind: "volume",
    active: true,
    createdAt: `${todayDate()}T10:00:00.000Z`,
  },
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
  await mergePeopleIfNeeded();
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
    const existing = await db.employees.toArray();
    const mirrors = (existing.length ? existing : DEFAULT_EMPLOYEES).filter(personCanConsume).map(asConsumeUser);
    if (mirrors.length) await db.consumeUsers.bulkAdd(mirrors);
  }
  if ((await db.internalAllowances.count()) === 0) {
    const niches = await db.niches.bulkGet(DEFAULT_ALLOWANCES.map((item) => item.nicheId));
    const existing = DEFAULT_ALLOWANCES.filter((_, index) => niches[index]);
    if (existing.length) await db.internalAllowances.bulkAdd(existing);
  } else {
    const rows = await db.internalAllowances.toArray();
    for (const row of rows) {
      if (row.enabled && (row.personLimit == null || row.personLimit <= 0)) {
        await db.internalAllowances.update(row.id, {
          personLimit: Math.min(1, Math.max(0, row.dailyLimit)),
        });
      }
    }
  }
  if ((await db.consumeGroups.count()) === 0) {
    for (const group of DEFAULT_CONSUME_GROUPS) {
      const niches = await db.niches.bulkGet(group.nicheIds);
      const nicheIds = group.nicheIds.filter((_, index) => niches[index]);
      if (nicheIds.length >= 2) {
        await db.consumeGroups.add({ ...group, nicheIds });
      }
    }
    const pastel = await db.internalAllowances.get("pas-local");
    if (pastel && (pastel.personLimit ?? 0) < 3) {
      await db.internalAllowances.update("pas-local", {
        personLimit: 3,
        dailyLimit: Math.max(pastel.dailyLimit, 10),
      });
    }
  }

  if ((await db.combos.count()) === 0) {
    const cox = await db.niches.get("cox-mini");
    const coca = await db.niches.get("coca-350");
    if (cox && coca) {
      await db.combos.bulkAdd(DEFAULT_COMBOS);
      await db.comboItems.bulkAdd(DEFAULT_COMBO_ITEMS);
    }
  }

  if ((await db.customers.count()) === 0) {
    await db.customers.bulkAdd(DEFAULT_CUSTOMERS);
  } else {
    const rows = await db.customers.toArray();
    for (const row of rows) {
      if (row.kind !== "festa" && row.kind !== "volume") {
        await db.customers.update(row.id, { kind: "festa" });
      }
    }
    if (!rows.some((row) => row.id === "cust-padaria-ze")) {
      const padaria = DEFAULT_CUSTOMERS.find((item) => item.id === "cust-padaria-ze");
      if (padaria) await db.customers.add(padaria);
    }
  }

  const cox = await db.niches.get("cox-mini");
  if (cox && !cox.promoAllowed) {
    await db.niches.update("cox-mini", { promoAllowed: true, promoPrice: 1.2, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) });
    await db.niches.update("coca-350", { promoAllowed: true, promoPrice: 5, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) });
    await db.niches.update("pas-local", { promoAllowed: true, promoPrice: 6.5, promoFrom: startOfDayIso(), promoTo: endOfDayIso(addDays(todayDate(), 14)) });
  }
  const coca = await db.products.get("prod-coca");
  if (coca && (!coca.perishable || !coca.shelfLifeDays)) {
    await db.products.update("prod-coca", { perishable: true, shelfLifeDays: 180 });
  }
  const openPromos = (await db.niches.toArray()).filter((item) => item.promoAllowed && !item.promoTo);
  for (const item of openPromos) {
    await db.niches.update(item.id, {
      promoFrom: item.promoFrom || startOfDayIso(),
      promoTo: endOfDayIso(addDays(todayDate(), 14)),
    });
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
    ["limpeza", "descartavel", "embalagem", "insumo"].includes(item.product.category),
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

  function lotOf(lotId: string) {
    return lots.find((lot) => lot.id === lotId);
  }

  function isSellableLot(lotId: string, asOf: string) {
    const lot = lotOf(lotId);
    if (!lot?.expiresAt) return true;
    return lot.expiresAt >= asOf;
  }

  function available(locationId: string, nicheId: string, asOf: string) {
    let total = 0;
    for (const row of stock.values()) {
      if (row.locationId === locationId && row.nicheId === nicheId && isSellableLot(row.lotId, asOf)) {
        total += row.qty;
      }
    }
    return total;
  }

  function take(locationId: string, nicheId: string, qty: number, asOf: string) {
    const rows = [...stock.values()]
      .filter((row) => row.locationId === locationId && row.nicheId === nicheId && row.qty > 0 && isSellableLot(row.lotId, asOf))
      .sort((a, b) => {
        const lotA = lotOf(a.lotId);
        const lotB = lotOf(b.lotId);
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

  function restocksOn(nicheId: string, daysAgo: number, weekday: number) {
    const category = PRODUCT_BY_NICHE.get(nicheId)?.category;
    if (category === "salgado") return true;
    if (category === "bebida") return daysAgo % 3 === 0;
    return weekday === 1 || daysAgo === 0;
  }

  function discardExpiredAsOf(asOf: string, at: string) {
    for (const row of [...stock.values()]) {
      if (row.qty <= 0 || isSellableLot(row.lotId, asOf)) continue;
      const itemNiche = NICHE_BY_ID.get(row.nicheId);
      addStock(row.locationId, row.nicheId, row.lotId, -row.qty);
      wastes.push({
        id: newId(),
        locationId: row.locationId,
        nicheId: row.nicheId,
        lotId: row.lotId,
        qty: row.qty,
        reason: "vencido",
        at,
        unitCost: itemNiche?.costPrice,
        unitPrice: itemNiche?.sellPrice,
      });
      movements.push({
        id: newId(),
        locationId: row.locationId,
        nicheId: row.nicheId,
        lotId: row.lotId,
        qty: -row.qty,
        type: "waste",
        refId: `vencido-${row.locationId}-${asOf}`,
        at,
      });
    }
  }

  function storeName(locationId: string) {
    return DEFAULT_STORES.find((store) => store.id === locationId)?.name ?? locationId;
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
    const closeAt = dayAt(daysAgo, 21, 15).toISOString();
    const dayScale = weekend ? 0.8 : 1;

    discardExpiredAsOf(madeAt, dayAt(daysAgo, 6, 40).toISOString());

    for (const nicheId of NICHE_IDS) {
      const plan = PLAN[nicheId];
      if (!plan || !restocksOn(nicheId, daysAgo, weekday)) continue;
      const qty = Math.max(1, Math.round(plan.produce * dayScale));
      const lotId = `lot-${nicheId}-${madeAt}`;
      lots.push({
        id: lotId,
        nicheId,
        madeAt,
        expiresAt: lotExpiry(nicheId, madeAt),
        unitCost: NICHE_BY_ID.get(nicheId)?.costPrice,
      });
      addStock("factory", nicheId, lotId, qty);
      const purchased = PRODUCT_BY_NICHE.get(nicheId)?.category !== "salgado";
      movements.push({
        id: newId(),
        locationId: "factory",
        nicheId,
        lotId,
        qty,
        type: purchased ? "purchase" : "production",
        refId: purchased ? `buy-${madeAt}` : `prod-${madeAt}`,
        at: producedAt,
      });
    }

    for (const [toLocationId, field] of [
      ["store_1", "store1"],
      ["store_2", "store2"],
    ] as const) {
      const sendCut = today && toLocationId === "store_2" ? 0.55 : today ? 0.85 : 1;
      const transferId = `tr-${toLocationId}-${madeAt}`;
      transfers.push({
        id: transferId,
        fromLocationId: "factory",
        toLocationId,
        at: sentAt,
        status: "conferido",
        receivedAt: sentAt,
        receivedBy: storeName(toLocationId),
        sentBy: "Rita Gomes",
      });

      for (const nicheId of NICHE_IDS) {
        const plan = PLAN[nicheId];
        if (!plan) continue;
        const qty = Math.round(plan[field] * dayScale * sendCut);
        if (qty <= 0) continue;
        const chunks = take("factory", nicheId, qty, madeAt);
        for (const chunk of chunks) {
          addStock(toLocationId, nicheId, chunk.lotId, chunk.qty);
          transferItems.push({
            id: newId(),
            transferId,
            nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
            receivedQty: chunk.qty,
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
      const centroWeek = storeId === "store_1" ? (weekend ? 0.75 : 1.15) : weekend ? 1.1 : 0.9;
      const tickets = Math.round((weekend ? 20 : 24) * centroWeek * (today ? 0.5 : 1));

      for (let ticket = 0; ticket < tickets; ticket += 1) {
        const hour = between(rng, 9, today ? 12 : 19);
        const at = dayAt(daysAgo, hour, between(rng, 0, 59)).toISOString();
        const saleId = newId();
        const channel = pick(rng, [
          "caixa",
          "caixa",
          "caixa",
          "caixa",
          "caixa",
          "delivery",
          "encomenda",
        ] as const);
        const payment = pick(rng, ["pix", "pix", "pix", "cartao", "cartao", "dinheiro"] as const);
        const itemCount = between(rng, 1, 3);
        const used = new Set<string>();
        const lines: SaleItem[] = [];

        for (let i = 0; i < itemCount; i += 1) {
          const popular = [
            "cox-mini",
            "cox-mini",
            "cox-festa",
            "ris-mini",
            "kibe-mini",
            "pas-local",
            "coca-350",
            "gua-350",
          ];
          const nicheId = pick(rng, popular);
          if (used.has(nicheId)) continue;
          used.add(nicheId);
          const have = available(storeId, nicheId, madeAt);
          if (have <= 0) continue;
          const want = between(rng, 2, storeId === "store_1" ? 8 : 6);
          const qty = Math.min(have, want);
          const itemNiche = NICHE_BY_ID.get(nicheId);
          if (!itemNiche || qty <= 0) continue;
          const usePromo = promoIsLive(itemNiche) && between(rng, 1, 6) === 1;
          const unitPrice = usePromo ? itemNiche.promoPrice : itemNiche.sellPrice;
          for (const chunk of take(storeId, nicheId, qty, madeAt)) {
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
        const total = Math.round(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0) * 100) / 100;
        let payments: SalePayment[] | undefined;
        if (total >= 15 && payment !== "dinheiro" && between(rng, 1, 8) === 1) {
          const cashPart = Math.round(Math.min(total - 1, Math.max(5, total * 0.3)) * 100) / 100;
          payments = [
            { method: payment, amount: Math.round((total - cashPart) * 100) / 100 },
            { method: "dinheiro", amount: cashPart },
          ];
        }
        sales.push({
          id: saleId,
          locationId: storeId,
          channel,
          payment,
          payments,
          total,
          at,
          cashSessionId: ensureSession(storeId, daysAgo, periodOf(hour)),
        });
        saleItems.push(...lines);
      }

      if (weekday !== 1 && available(storeId, "pas-local", madeAt) > 2) {
        const consumeAt = dayAt(daysAgo, 11, 20).toISOString();
        const qty = Math.min(1, available(storeId, "pas-local", madeAt));
        for (const chunk of take(storeId, "pas-local", qty, madeAt)) {
          const consumer = storeId === "store_1" ? DEFAULT_EMPLOYEES[0] : DEFAULT_EMPLOYEES[2];
          consumptions.push({
            id: newId(),
            locationId: storeId,
            nicheId: "pas-local",
            lotId: chunk.lotId,
            unitCost: NICHE_BY_ID.get("pas-local")?.costPrice,
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

      if (!today) {
        const leftoverSkus = storeId === "store_1"
          ? (["cox-mini", "ris-mini", "cox-assado"] as const)
          : (["cox-mini", "kibe-mini", "pas-local"] as const);
        for (const nicheId of leftoverSkus) {
          const have = available(storeId, nicheId, madeAt);
          if (have < 4) continue;
          const qty = Math.min(have - 2, between(rng, 3, 10));
          const itemNiche = NICHE_BY_ID.get(nicheId);
          if (!itemNiche || qty <= 0) continue;
          for (const chunk of take(storeId, nicheId, qty, madeAt)) {
            wastes.push({
              id: newId(),
              locationId: storeId,
              nicheId,
              lotId: chunk.lotId,
              qty: chunk.qty,
              reason: "sobra_frito",
              at: closeAt,
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
              at: closeAt,
            });
          }
        }
      }
    }

    if (!today) {
      discardExpiredAsOf(addDays(madeAt, 1), closeAt);
    }
  }

  const expiredMade = dateKey(4);
  lots.push({
    id: "lot-expired-cox",
    nicheId: "cox-mini",
    madeAt: expiredMade,
    expiresAt: addDays(expiredMade, 2),
    unitCost: NICHE_BY_ID.get("cox-mini")?.costPrice,
  });
  addStock("store_1", "cox-mini", "lot-expired-cox", 8);

  const todayKey = dateKey(0);
  const lateId = "tr-store_2-manha-tarde";
  const lateChunks = take("factory", "cox-festa", 12, todayKey);
  if (lateChunks.length) {
    transfers.push({
      id: lateId,
      fromLocationId: "factory",
      toLocationId: "store_2",
      at: dayAt(0, 10, 40).toISOString(),
      status: "em_transito",
      sentBy: "Rita Gomes",
    });
    for (const chunk of lateChunks) {
      transferItems.push({
        id: newId(),
        transferId: lateId,
        nicheId: "cox-festa",
        lotId: chunk.lotId,
        qty: chunk.qty,
      });
      movements.push({
        id: newId(),
        locationId: "factory",
        nicheId: "cox-festa",
        lotId: chunk.lotId,
        qty: -chunk.qty,
        type: "send",
        refId: lateId,
        at: dayAt(0, 10, 40).toISOString(),
      });
    }
  }

  for (const session of cashSessions.values()) {
    const sessionSales = sales.filter((sale) => sale.cashSessionId === session.id);
    const cashSales = sessionSales.reduce((sum, sale) => sum + salePaymentShare(sale, "dinheiro"), 0);
    const pixSales = sessionSales.reduce((sum, sale) => sum + salePaymentShare(sale, "pix"), 0);
    const cardSales = sessionSales.reduce((sum, sale) => sum + salePaymentShare(sale, "cartao"), 0);
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
        destination: "cofre",
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
    if (Math.abs(difference) >= 0.005) {
      session.secondCount = session.closingAmount;
      session.recountedBy = session.employeeName;
    }
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
      db.consumeGroups,
      db.combos,
      db.comboItems,
      db.settings,
      db.consumptions,
      db.consumeUsers,
      db.customers,
      db.factoryOrders,
      db.factoryOrderItems,
      db.cashMovements,
      db.inventoryCounts,
      db.inventoryLines,
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
        db.consumeGroups.clear(),
        db.combos.clear(),
        db.comboItems.clear(),
        db.settings.clear(),
        db.consumptions.clear(),
        db.consumeUsers.clear(),
        db.customers.clear(),
        db.factoryOrders.clear(),
        db.factoryOrderItems.clear(),
        db.cashMovements.clear(),
        db.inventoryCounts.clear(),
        db.inventoryLines.clear(),
      ]);
      await db.products.bulkAdd(products);
      await db.niches.bulkAdd(niches);
      await db.lots.bulkAdd(lots);
      await db.stock.bulkAdd([...stock.values()]);
      await db.movements.bulkAdd(movements);
      await db.transfers.bulkAdd(transfers.filter((row) => transferItems.some((item) => item.transferId === row.id)));
      await db.transferItems.bulkAdd(transferItems);
      await db.sales.bulkAdd(sales);
      await db.saleItems.bulkAdd(saleItems);
      await db.wastes.bulkAdd(wastes);
      await db.stores.bulkAdd(DEFAULT_STORES);
      await db.employees.bulkAdd(DEFAULT_EMPLOYEES);
      await db.cashSessions.bulkAdd([...cashSessions.values()]);
      await db.internalAllowances.bulkAdd(DEFAULT_ALLOWANCES);
      await db.consumeGroups.bulkAdd(DEFAULT_CONSUME_GROUPS);
      await db.combos.bulkAdd(DEFAULT_COMBOS);
      await db.comboItems.bulkAdd(DEFAULT_COMBO_ITEMS);
      await db.consumeUsers.bulkAdd(DEFAULT_CONSUME_USERS);
      await db.customers.bulkAdd(DEFAULT_CUSTOMERS);
      await db.consumptions.bulkAdd(consumptions);
      if (cashMovements.length) await db.cashMovements.bulkAdd(cashMovements);
      await db.settings.put({ id: CASH_REOPEN_SETTING, value: CASH_REOPEN_CODE });
    },
  );

  await refreshLocations();

  await createStoreRequest({
    fromLocationId: "store_1",
    note: "Cliente da festa de aniversário amanhã. Festa e pastel.",
    items: [
      { nicheId: "cox-festa", qty: 40 },
      { nicheId: "pas-local", qty: 15 },
    ],
  });
  await createStoreRequest({
    fromLocationId: "store_2",
    note: "Geladeira do Jardim no fim. Mandar lata.",
    items: [{ nicheId: "coca-350", qty: 18 }],
  });
}
