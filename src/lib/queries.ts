import { getDb } from "./db";
import { LOCATIONS, storeLocations, type Location } from "./locations";
import { periodRange, type Period } from "./money";
import { factoryMin, isLowAt, storeMin } from "./stock-min";
import type { Niche, Product, Sale, SaleItem, Waste } from "./types";

export type CatalogItem = {
  niche: Niche;
  product: Product;
  label: string;
};

export type StockView = CatalogItem & { qty: Record<string, number> };

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

export type DashboardData = {
  revenue: number;
  cost: number;
  margin: number;
  wasteQty: number;
  wasteCost: number;
  wasteRevenue: number;
  producedQty: number;
  sentQty: number;
  salesCount: number;
  byLocation: LocationMetrics[];
  bestSellers: { label: string; qty: number; revenue: number }[];
  payments: { name: string; total: number }[];
  channels: { name: string; total: number }[];
  daily: { day: string; receita: number; perda: number }[];
  factoryAlerts: AlertItem[];
  storeAlerts: AlertItem[];
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
  const [items, rows] = await Promise.all([catalogItems(false), db.stock.toArray()]);
  const qty = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.locationId}:${row.nicheId}`;
    qty.set(key, (qty.get(key) ?? 0) + row.qty);
  }

  return items.map((item) => ({
    ...item,
    qty: Object.fromEntries(
      LOCATIONS.map((location) => [
        location.id,
        qty.get(`${location.id}:${item.niche.id}`) ?? 0,
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
      const qty = item.qty[location.id] ?? 0;
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
  for (const row of scopedWaste) {
    const money = wasteMoney(row, nicheById.get(row.nicheId)?.niche);
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

  return {
    revenue,
    cost,
    margin: revenue - cost,
    wasteQty,
    wasteCost,
    wasteRevenue,
    producedQty,
    sentQty,
    salesCount: scopedSales.length,
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
  };
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

