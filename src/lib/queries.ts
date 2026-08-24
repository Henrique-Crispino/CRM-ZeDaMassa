import { getDb } from "./db";
import { LOCATIONS, storeLocations, getLocation, type Location } from "./locations";
import { daysUntil, periodRange, todayDate, type Period } from "./money";
import { factoryMin, isLowAt, storeMin } from "./stock-min";
import type { Niche, Product, Sale, SaleItem, Waste } from "./types";

export type CatalogItem = {
  niche: Niche;
  product: Product;
  label: string;
};

export type StockView = CatalogItem & {
  qty: Record<string, number>;
  expiredQty: Record<string, number>;
};

export function sellableQty(item: Pick<StockView, "qty" | "expiredQty">, locationId: string) {
  return Math.max(0, (item.qty[locationId] ?? 0) - (item.expiredQty[locationId] ?? 0));
}

export type AlertItem = {
  nicheId: string;
  label: string;
  locationId: string;
  locationName: string;
  qty: number;
  min: number;
  missing: number;
};

export type LocationMetrics = {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  wasteQty: number;
  wasteCost: number;
  wasteRevenue: number;
  salesCount: number;
};

export type ExpiryLevel = "expired" | "today" | "soon";

export type ExpiryAlert = {
  lotId: string;
  nicheId: string;
  label: string;
  locationId: string;
  locationName: string;
  qty: number;
  madeAt: string;
  expiresAt: string;
  daysLeft: number;
  level: ExpiryLevel;
};

export function expiryLevel(daysLeft: number): ExpiryLevel {
  if (daysLeft < 0) return "expired";
  if (daysLeft === 0) return "today";
  return "soon";
}

export function expiryLevelLabel(item: Pick<ExpiryAlert, "daysLeft" | "level">) {
  if (item.level === "expired") {
    return item.daysLeft === -1 ? "Venceu ontem" : `Vencido há ${Math.abs(item.daysLeft)} dias`;
  }
  if (item.level === "today") return "Vence hoje";
  return item.daysLeft === 1 ? "Vence amanhã" : `Vence em ${item.daysLeft} dias`;
}

export type ProductionLog = {
  refId: string;
  at: string;
  madeAt: string;
  totalQty: number;
  items: { label: string; qty: number; expiresAt?: string }[];
};

export type DashboardData = {
  revenue: number;
  cost: number;
  margin: number;
  wasteQty: number;
  wasteCost: number;
  wasteRevenue: number;
  expiredQty: number;
  expiredCost: number;
  expiredRevenue: number;
  producedQty: number;
  sentQty: number;
  salesCount: number;
  promoRevenue: number;
  internalQty: number;
  byLocation: LocationMetrics[];
  bestSellers: { label: string; qty: number; revenue: number }[];
  payments: { name: string; total: number }[];
  channels: { name: string; total: number }[];
  daily: { day: string; receita: number; perda: number }[];
  factoryAlerts: AlertItem[];
  storeAlerts: AlertItem[];
  expiryAlerts: ExpiryAlert[];
};

export async function catalogItems(activeOnly = true): Promise<CatalogItem[]> {
  const db = getDb();
  const [products, allNiches] = await Promise.all([
    db.products.toArray(),
    db.niches.toArray(),
  ]);
  const niches = activeOnly ? allNiches.filter((niche) => niche.active) : allNiches;

  const byId = new Map(products.map((product) => [product.id, product]));
  return niches
    .map((niche) => {
      const product = byId.get(niche.productId);
      if (!product) return null;
      return {
        niche,
        product,
        label: `${product.name} · ${niche.name}`,
      };
    })
    .filter((item): item is CatalogItem => item !== null)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function stockByLocation(): Promise<StockView[]> {
  const db = getDb();
  const [items, rows, lots] = await Promise.all([catalogItems(false), db.stock.toArray(), db.lots.toArray()]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const today = todayDate();
  const qty = new Map<string, number>();
  const expired = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.locationId}:${row.nicheId}`;
    qty.set(key, (qty.get(key) ?? 0) + row.qty);
    const lot = lotById.get(row.lotId);
    if (lot?.expiresAt && lot.expiresAt < today) {
      expired.set(key, (expired.get(key) ?? 0) + row.qty);
    }
  }

  return items.map((item) => ({
    ...item,
    qty: Object.fromEntries(
      LOCATIONS.map((location) => [
        location.id,
        qty.get(`${location.id}:${item.niche.id}`) ?? 0,
      ]),
    ) as Record<string, number>,
    expiredQty: Object.fromEntries(
      LOCATIONS.map((location) => [
        location.id,
        expired.get(`${location.id}:${item.niche.id}`) ?? 0,
      ]),
    ) as Record<string, number>,
  }));
}

export async function stockAlerts(scope: "all" | "factory" | string = "all") {
  const rows = await stockByLocation();
  const factoryAlerts: AlertItem[] = [];
  const storeAlerts: AlertItem[] = [];

  for (const item of rows) {
    for (const location of LOCATIONS) {
      const qty = sellableQty(item, location.id);
      if (!isLowAt(location, item.niche, qty)) continue;

      const min = location.type === "factory" ? factoryMin(item.niche) : storeMin(item.niche);
      const alert: AlertItem = {
        nicheId: item.niche.id,
        label: item.label,
        locationId: location.id,
        locationName: location.name,
        qty,
        min,
        missing: Math.max(0, min - qty),
      };

      if (location.type === "factory") factoryAlerts.push(alert);
      else storeAlerts.push(alert);
    }
  }

  if (scope === "factory" || scope === "all") {
    return { factoryAlerts, storeAlerts };
  }

  return {
    factoryAlerts: [],
    storeAlerts: storeAlerts.filter((item) => item.locationId === scope),
  };
}

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
};

const CHANNEL_LABEL: Record<string, string> = {
  caixa: "No caixa",
  delivery: "Delivery",
  encomenda: "Encomenda",
};

function emptyLocationMetrics(location: Location): LocationMetrics {
  return {
    id: location.id,
    name: location.name,
    revenue: 0,
    cost: 0,
    margin: 0,
    wasteQty: 0,
    wasteCost: 0,
    wasteRevenue: 0,
    salesCount: 0,
  };
}

function wasteMoney(row: Waste, niche?: Niche) {
  const cost = row.unitCost ?? niche?.costPrice ?? 0;
  const price = row.unitPrice ?? niche?.sellPrice ?? 0;
  return { cost: row.qty * cost, revenue: row.qty * price };
}

export async function loadDashboard(period: Period, scope?: string): Promise<DashboardData> {
  const db = getDb();
  const { from, to, days } = periodRange(period);
  const catalog = await catalogItems(false);
  const nicheById = new Map(catalog.map((item) => [item.niche.id, item]));

  const [sales, wastes, movements] = await Promise.all([
    db.sales.where("at").between(from, to, true, true).toArray(),
    db.wastes.where("at").between(from, to, true, true).toArray(),
    db.movements.where("at").between(from, to, true, true).toArray(),
  ]);

  const scopedSales =
    scope && scope !== "admin" && scope !== "factory"
      ? sales.filter((sale) => sale.locationId === scope)
      : sales;
  const scopedWaste =
    scope && scope !== "admin" && scope !== "factory"
      ? wastes.filter((row) => row.locationId === scope)
      : wastes;

  const saleItems = (
    await Promise.all(scopedSales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();

  const revenue = saleItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const cost = saleItems.reduce((sum, item) => sum + item.unitCost * item.qty, 0);

  let wasteQty = 0;
  let wasteCost = 0;
  let wasteRevenue = 0;
  let expiredQty = 0;
  let expiredCost = 0;
  let expiredRevenue = 0;
  for (const row of scopedWaste) {
    const money = wasteMoney(row, nicheById.get(row.nicheId)?.niche);
    if (row.reason === "vencido") {
      expiredQty += row.qty;
      expiredCost += money.cost;
      expiredRevenue += money.revenue;
      continue;
    }
    wasteQty += row.qty;
    wasteCost += money.cost;
    wasteRevenue += money.revenue;
  }

  const locationsForMetrics =
    scope && scope !== "admin" && scope !== "factory"
      ? LOCATIONS.filter((location) => location.id === scope)
      : storeLocations();

  const byLocation = locationsForMetrics.map((location) => emptyLocationMetrics(location));
  const byId = new Map(byLocation.map((item) => [item.id, item]));

  for (const sale of scopedSales) {
    const row = byId.get(sale.locationId);
    if (row) row.salesCount += 1;
  }

  const itemsBySale = new Map<string, SaleItem[]>();
  for (const item of saleItems) {
    const list = itemsBySale.get(item.saleId) ?? [];
    list.push(item);
    itemsBySale.set(item.saleId, list);
  }

  for (const sale of scopedSales) {
    const row = byId.get(sale.locationId);
    if (!row) continue;
    for (const item of itemsBySale.get(sale.id) ?? []) {
      row.revenue += item.unitPrice * item.qty;
      row.cost += item.unitCost * item.qty;
    }
    row.margin = row.revenue - row.cost;
  }

  for (const waste of scopedWaste) {
    if (waste.reason === "vencido") continue;
    const row = byId.get(waste.locationId);
    if (!row) continue;
    const money = wasteMoney(waste, nicheById.get(waste.nicheId)?.niche);
    row.wasteQty += waste.qty;
    row.wasteCost += money.cost;
    row.wasteRevenue += money.revenue;
  }

  const sellerQty = new Map<string, { qty: number; revenue: number }>();
  for (const item of saleItems) {
    const current = sellerQty.get(item.nicheId) ?? { qty: 0, revenue: 0 };
    current.qty += item.qty;
    current.revenue += item.unitPrice * item.qty;
    sellerQty.set(item.nicheId, current);
  }

  const bestSellers = [...sellerQty.entries()]
    .map(([id, value]) => ({
      label: nicheById.get(id)?.label ?? "Produto",
      qty: value.qty,
      revenue: value.revenue,
    }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  const paymentsMap = new Map<string, number>();
  const channelsMap = new Map<string, number>();
  for (const sale of scopedSales) {
    paymentsMap.set(sale.payment, (paymentsMap.get(sale.payment) ?? 0) + sale.total);
    channelsMap.set(sale.channel, (channelsMap.get(sale.channel) ?? 0) + sale.total);
  }

  const daily = buildDaily(days, scopedSales, itemsBySale, scopedWaste, nicheById);

  const producedQty = movements
    .filter((item) => item.type === "production" && item.qty > 0)
    .reduce((sum, item) => sum + item.qty, 0);
  const sentQty = movements
    .filter((item) => item.type === "send" && item.locationId === "factory" && item.qty < 0)
    .reduce((sum, item) => sum + Math.abs(item.qty), 0);

  const alerts = await stockAlerts(scope === "admin" || !scope ? "all" : scope === "factory" ? "factory" : scope);
  const expiryAlerts = await expiryAlertsFor(scope);
  const promoRevenue = saleItems.filter((item) => item.promo).reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const scopedInternal = movements.filter((item) => {
    if (item.type !== "internal") return false;
    if (scope && scope !== "admin" && scope !== "factory") return item.locationId === scope;
    return true;
  });
  const internalQty = scopedInternal.reduce((sum, item) => sum + Math.abs(item.qty), 0);

  return {
    revenue,
    cost,
    margin: revenue - cost,
    wasteQty,
    wasteCost,
    wasteRevenue,
    expiredQty,
    expiredCost,
    expiredRevenue,
    producedQty,
    sentQty,
    salesCount: scopedSales.length,
    promoRevenue,
    internalQty,
    byLocation,
    bestSellers,
    payments: [...paymentsMap.entries()].map(([name, total]) => ({
      name: PAYMENT_LABEL[name] ?? name,
      total,
    })),
    channels: [...channelsMap.entries()].map(([name, total]) => ({
      name: CHANNEL_LABEL[name] ?? name,
      total,
    })),
    daily,
    factoryAlerts: alerts.factoryAlerts,
    storeAlerts: alerts.storeAlerts,
    expiryAlerts,
  };
}

export async function expiryAlertsFor(scope?: string): Promise<ExpiryAlert[]> {
  const db = getDb();
  const [rows, lots, catalog] = await Promise.all([
    db.stock.toArray(),
    db.lots.toArray(),
    catalogItems(false),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const labelByNiche = new Map(catalog.map((item) => [item.niche.id, item.label]));
  const alerts: ExpiryAlert[] = [];

  for (const row of rows) {
    if (row.qty <= 0) continue;
    if (scope && scope !== "admin" && scope !== "factory" && row.locationId !== scope) continue;
    const lot = lotById.get(row.lotId);
    if (!lot?.expiresAt) continue;
    const daysLeft = daysUntil(lot.expiresAt);
    if (daysLeft > 2) continue;
    alerts.push({
      lotId: lot.id,
      nicheId: row.nicheId,
      label: labelByNiche.get(row.nicheId) ?? "Produto",
      locationId: row.locationId,
      locationName: getLocation(row.locationId)?.name ?? row.locationId,
      qty: row.qty,
      madeAt: lot.madeAt,
      expiresAt: lot.expiresAt,
      daysLeft,
      level: expiryLevel(daysLeft),
    });
  }

  return alerts.sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label, "pt-BR"));
}

export async function listProductionLogs(limit = 40, madeOn?: string): Promise<ProductionLog[]> {
  const db = getDb();
  const [movements, lots, catalog] = await Promise.all([
    db.movements.toArray(),
    db.lots.toArray(),
    catalogItems(false),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const labelByNiche = new Map(catalog.map((item) => [item.niche.id, item.label]));
  const groups = new Map<string, ProductionLog>();

  for (const movement of movements.filter((item) => item.type === "production" && item.qty > 0)) {
    const lot = lotById.get(movement.lotId);
    const current = groups.get(movement.refId) ?? {
      refId: movement.refId,
      at: movement.at,
      madeAt: lot?.madeAt ?? movement.at.slice(0, 10),
      totalQty: 0,
      items: [],
    };
    current.totalQty += movement.qty;
    if (movement.at > current.at) current.at = movement.at;
    current.items.push({
      label: labelByNiche.get(movement.nicheId) ?? "Produto",
      qty: movement.qty,
      expiresAt: lot?.expiresAt,
    });
    groups.set(movement.refId, current);
  }

  return [...groups.values()]
    .filter((log) => !madeOn || log.madeAt === madeOn)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, madeOn ? 200 : limit);
}

function buildDaily(
  days: number,
  sales: Sale[],
  itemsBySale: Map<string, SaleItem[]>,
  wastes: Waste[],
  nicheById: Map<string, CatalogItem>,
) {
  const keys: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    keys.push(day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
  }

  const rows = keys.map((day) => ({ day, receita: 0, perda: 0 }));
  const index = new Map(keys.map((day, i) => [day, rows[i]]));

  for (const sale of sales) {
    const key = new Date(sale.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const row = index.get(key);
    if (!row) continue;
    for (const item of itemsBySale.get(sale.id) ?? []) {
      row.receita += item.unitPrice * item.qty;
    }
  }

  for (const waste of wastes) {
    const key = new Date(waste.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const row = index.get(key);
    if (!row) continue;
    row.perda += wasteMoney(waste, nicheById.get(waste.nicheId)?.niche).revenue;
  }

  return days > 7 ? rows.filter((_, i) => i % Math.ceil(days / 10) === 0 || i === rows.length - 1) : rows;
}

