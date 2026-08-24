import { getDb } from "./db";
import { LOCATIONS, storeLocations, getLocation, type Location } from "./locations";
import { daysUntil, formatDate, periodRange, todayDate, type Period } from "./money";
import { factoryMin, isLowAt, storeMin } from "./stock-min";
import type { MovementType, Niche, Product, ReturnReason, Sale, SaleItem, TransferKind, TransferStatus, Waste } from "./types";
import {
  adjustmentReasonLabel,
  isLiveSale,
  movementLabel,
  productIsLive,
  salePaymentSummary,
  salePayments,
  receivedQtyOf,
  returnReasonLabel,
  saleVoidReasonLabel,
  transferKind,
  transferKindLabel,
  transferStatus,
  transferStatusLabel,
} from "./types";

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
      if (activeOnly && !productIsLive(product)) return null;
      return {
        niche,
        product,
        label: `${product.name} · ${niche.name}`,
      };
    })
    .filter((item): item is CatalogItem => item !== null)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function stockQtyTotal(qty: Record<string, number>) {
  return Object.values(qty).reduce((sum, n) => sum + n, 0);
}

export function productStockQty(rows: StockView[], productId: string) {
  return rows
    .filter((item) => item.product.id === productId)
    .reduce((sum, item) => sum + stockQtyTotal(item.qty), 0);
}

export async function setProductActive(productId: string, active: boolean) {
  const db = getDb();
  const product = await db.products.get(productId);
  if (!product) throw new Error("Produto não encontrado.");
  await db.products.put({ ...product, active });
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
    if (!productIsLive(item.product)) continue;
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
    db.sales.where("at").between(from, to, true, true).toArray().then((rows) => rows.filter(isLiveSale)),
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
    if (row.reason === "devolucao") continue;
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
    if (waste.reason === "vencido" || waste.reason === "devolucao") continue;
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
    for (const row of salePayments(sale)) {
      paymentsMap.set(row.method, (paymentsMap.get(row.method) ?? 0) + row.amount);
    }
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

export async function listPurchaseLogs(limit = 40): Promise<ProductionLog[]> {
  const db = getDb();
  const [movements, lots, catalog] = await Promise.all([
    db.movements.toArray(),
    db.lots.toArray(),
    catalogItems(false),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const labelByNiche = new Map(catalog.map((item) => [item.niche.id, item.label]));
  const groups = new Map<string, ProductionLog>();

  for (const movement of movements.filter((item) => item.type === "purchase" && item.qty > 0)) {
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

  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
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

export type InventorySheetRow = {
  key: string;
  nicheId: string;
  lotId?: string;
  label: string;
  hint: string;
  systemQty: number;
};

export async function inventorySheet(locationId: string): Promise<InventorySheetRow[]> {
  const db = getDb();
  const [catalog, rows, lots] = await Promise.all([
    catalogItems(false),
    db.stock.where("locationId").equals(locationId).toArray(),
    db.lots.toArray(),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const sheet: InventorySheetRow[] = [];

  for (const item of catalog) {
    const here = rows.filter((row) => row.nicheId === item.niche.id && row.qty > 0);
    const live = productIsLive(item.product) && item.niche.active;
    if (!live && here.length === 0) continue;
    if (item.product.perishable && here.length > 0) {
      for (const row of here) {
        const lot = lotById.get(row.lotId);
        sheet.push({
          key: `${item.niche.id}:${row.lotId}`,
          nicheId: item.niche.id,
          lotId: row.lotId,
          label: item.label,
          hint: lot?.expiresAt
            ? `Lote feito em ${formatDate(lot.madeAt)} · vale até ${formatDate(lot.expiresAt)}`
            : `Lote feito em ${formatDate(lot?.madeAt ?? row.lotId)}`,
          systemQty: row.qty,
        });
      }
      continue;
    }

    sheet.push({
      key: item.niche.id,
      nicheId: item.niche.id,
      label: item.label,
      hint: item.product.perishable
        ? "Nenhum lote aqui agora. Se achar produto, some nesta linha."
        : "Quantidade total neste local.",
      systemQty: here.reduce((sum, row) => sum + row.qty, 0),
    });
  }

  return sheet.sort(
    (a, b) => a.label.localeCompare(b.label, "pt-BR") || a.hint.localeCompare(b.hint, "pt-BR"),
  );
}

function localDay(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export type KardexRow = {
  id: string;
  at: string;
  locationId: string;
  locationName: string;
  nicheId: string;
  label: string;
  lotHint: string;
  type: MovementType;
  typeLabel: string;
  qty: number;
  who: string;
  note: string;
  balance?: number;
};

export type KardexExtract = {
  label: string;
  opening: number | null;
  closing: number | null;
  rows: KardexRow[];
};

export async function loadKardex(input: {
  nicheId: string;
  locationId?: string;
  from: string;
  to: string;
}): Promise<KardexExtract> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const found = catalog.find((item) => item.niche.id === input.nicheId);
  const label = found?.label ?? "Produto";

  const [movements, lots, sales, sessions, consumptions, wastes, transfers, counts, lines] = await Promise.all([
    db.movements.where("nicheId").equals(input.nicheId).toArray(),
    db.lots.toArray(),
    db.sales.toArray(),
    db.cashSessions.toArray(),
    db.consumptions.toArray(),
    db.wastes.toArray(),
    db.transfers.toArray(),
    db.inventoryCounts.toArray(),
    db.inventoryLines.toArray(),
  ]);

  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const transferById = new Map(transfers.map((row) => [row.id, row]));
  const countById = new Map(counts.map((row) => [row.id, row]));

  const scoped = movements
    .filter((row) => !input.locationId || row.locationId === input.locationId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const opening =
    input.locationId == null
      ? null
      : scoped.filter((row) => row.at < input.from).reduce((sum, row) => sum + row.qty, 0);

  let running = opening ?? 0;
  const rows: KardexRow[] = [];

  for (const movement of scoped) {
    if (movement.at < input.from || movement.at > input.to) continue;
    const lot = lotById.get(movement.lotId);
    const locationName = getLocation(movement.locationId)?.name ?? movement.locationId;
    let who = locationName;
    let note = "";

    if (movement.type === "production") {
      who = "Fábrica";
      note = "Entrou da produção";
    } else if (movement.type === "purchase") {
      who = "Fábrica";
      note = "Entrada de mercadoria";
    } else if (movement.type === "send") {
      const transfer = transferById.get(movement.refId);
      const dest = getLocation(transfer?.toLocationId ?? "")?.name ?? transfer?.toLocationId ?? "loja";
      if (movement.qty < 0) {
        who = "Fábrica";
        note = `Mandou para ${dest}`;
        if (transfer && transferStatus(transfer) === "em_transito") note += " · ainda em trânsito";
      } else if (movement.locationId === "factory") {
        who = transfer?.receivedBy ?? dest;
        note = `Voltou da conferência · não chegou na ${dest}`;
      } else {
        who = transfer?.receivedBy ?? locationName;
        note = `Recebeu da ${getLocation(transfer?.fromLocationId ?? "factory")?.name ?? "fábrica"}`;
        if (transfer && transferStatus(transfer) === "divergente") note += " · conferência com divergência";
      }
    } else if (movement.type === "return") {
      const transfer = transferById.get(movement.refId);
      const storeName =
        getLocation(transfer?.fromLocationId ?? "")?.name ?? transfer?.fromLocationId ?? "loja";
      if (movement.qty < 0) {
        who = locationName;
        note = `${returnReasonLabel(transfer?.reason)} · voltando para a fábrica`;
        if (transfer && transferStatus(transfer) === "em_transito") note += " · ainda em trânsito";
      } else {
        who = transfer?.receivedBy ?? "Fábrica";
        note = `Voltou da ${storeName}`;
      }
    } else if (movement.type === "sale" || movement.type === "sale_void") {
      const sale = saleById.get(movement.refId);
      const session = sale?.cashSessionId ? sessionById.get(sale.cashSessionId) : undefined;
      who = session?.employeeName ?? locationName;
      note =
        movement.type === "sale_void"
          ? saleVoidReasonLabel(sale?.voidReason)
          : sale
            ? salePaymentSummary(sale)
            : "Venda";
    } else if (movement.type === "internal") {
      const consume = consumptions.find(
        (row) =>
          row.locationId === movement.locationId &&
          row.lotId === movement.lotId &&
          row.qty === Math.abs(movement.qty) &&
          localDay(row.at) === localDay(movement.at),
      );
      who = consume?.userName ?? locationName;
      note = "Consumo interno";
    } else if (movement.type === "waste") {
      const waste = wastes.find(
        (row) =>
          row.locationId === movement.locationId &&
          row.lotId === movement.lotId &&
          row.qty === Math.abs(movement.qty) &&
          localDay(row.at) === localDay(movement.at),
      );
      who = locationName;
      note =
        waste?.reason === "vencido"
          ? "Descarte de vencido"
          : waste?.reason === "devolucao"
            ? "Devolução sem condição"
            : "Sobra do dia";
    } else if (movement.type === "ajuste") {
      const count = countById.get(movement.refId);
      const line = lines.find((row) => row.countId === movement.refId && row.nicheId === movement.nicheId);
      who = count?.countedBy ?? locationName;
      note = adjustmentReasonLabel(line?.reason);
    }

    if (opening != null) running += movement.qty;
    rows.push({
      id: movement.id,
      at: movement.at,
      locationId: movement.locationId,
      locationName,
      nicheId: movement.nicheId,
      label,
      lotHint: lot?.expiresAt
        ? `Lote ${formatDate(lot.madeAt)} · vale até ${formatDate(lot.expiresAt)}`
        : lot?.madeAt
          ? `Lote ${formatDate(lot.madeAt)}`
          : "Sem lote",
      type: movement.type,
      typeLabel: movementLabel(movement.type),
      qty: movement.qty,
      who,
      note,
      balance: opening == null ? undefined : running,
    });
  }

  const closing = opening == null ? null : running;

  return { label, opening, closing, rows };
}

export type TransferLineView = {
  id: string;
  nicheId: string;
  lotId: string;
  label: string;
  lotHint: string;
  qty: number;
  receivedQty?: number;
  discardedQty?: number;
};

export type TransferView = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  fromName: string;
  toName: string;
  storeName: string;
  at: string;
  receivedAt?: string;
  receivedBy?: string;
  kind: TransferKind;
  kindLabel: string;
  reason?: ReturnReason;
  reasonLabel?: string;
  status: TransferStatus;
  statusLabel: string;
  sentQty: number;
  arrivedQty: number;
  discardedQty: number;
  items: TransferLineView[];
};

export async function listTransfers(filter?: {
  toLocationId?: string;
  fromLocationId?: string;
  kind?: TransferKind;
}): Promise<TransferView[]> {
  const db = getDb();
  const [transfers, items, catalog, lots] = await Promise.all([
    db.transfers.toArray(),
    db.transferItems.toArray(),
    catalogItems(false),
    db.lots.toArray(),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));

  return transfers
    .filter((row) => {
      if (filter?.toLocationId && row.toLocationId !== filter.toLocationId) return false;
      if (filter?.fromLocationId && row.fromLocationId !== filter.fromLocationId) return false;
      if (filter?.kind && transferKind(row) !== filter.kind) return false;
      return true;
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((row) => {
      const status = transferStatus(row);
      const kind = transferKind(row);
      const lines = items
        .filter((item) => item.transferId === row.id)
        .map((item) => {
          const found = catalog.find((entry) => entry.niche.id === item.nicheId);
          const lot = lotById.get(item.lotId);
          return {
            id: item.id,
            nicheId: item.nicheId,
            lotId: item.lotId,
            label: found?.label ?? "Produto",
            lotHint: lot?.expiresAt
              ? `Lote ${formatDate(lot.madeAt)} · vale até ${formatDate(lot.expiresAt)}`
              : lot?.madeAt
                ? `Lote ${formatDate(lot.madeAt)}`
                : "Sem lote",
            qty: item.qty,
            receivedQty: receivedQtyOf(item, status),
            discardedQty: item.discardedQty,
          };
        });
      const fromName = getLocation(row.fromLocationId)?.name ?? row.fromLocationId;
      const toName = getLocation(row.toLocationId)?.name ?? row.toLocationId;
      return {
        id: row.id,
        fromLocationId: row.fromLocationId,
        toLocationId: row.toLocationId,
        fromName,
        toName,
        storeName: kind === "devolucao" ? fromName : toName,
        at: row.at,
        receivedAt: row.receivedAt,
        receivedBy: row.receivedBy,
        kind,
        kindLabel: transferKindLabel(kind),
        reason: row.reason,
        reasonLabel: row.reason ? returnReasonLabel(row.reason) : undefined,
        status,
        statusLabel: transferStatusLabel(status),
        sentQty: lines.reduce((sum, line) => sum + line.qty, 0),
        arrivedQty: lines.reduce((sum, line) => sum + (line.receivedQty ?? 0), 0),
        discardedQty: lines.reduce((sum, line) => sum + (line.discardedQty ?? 0), 0),
        items: lines,
      };
    });
}

