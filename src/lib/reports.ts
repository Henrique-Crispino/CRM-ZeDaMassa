import { getDb } from "./db";
import { LOCATIONS, getLocation, storeLocations } from "./locations";
import {
  endOfDayIso,
  formatBRL,
  formatDate,
  formatTime,
  periodLabel,
  periodRange,
  startOfDayIso,
  type Period,
} from "./money";
import { catalogItems, stockByLocation } from "./queries";
import { factoryMin, storeMin } from "./stock-min";
import type { Niche } from "./types";

export type StoreScope = "all" | "store_1" | "store_2";

export type ReportTable = {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  notes?: string[];
};

function money(value: number) {
  return formatBRL(value);
}

function wasteMoney(qty: number, niche?: Niche, unitCost?: number, unitPrice?: number) {
  const cost = unitCost ?? niche?.costPrice ?? 0;
  const price = unitPrice ?? niche?.sellPrice ?? 0;
  return { cost: qty * cost, revenue: qty * price };
}

function scopeName(scope: StoreScope) {
  if (scope === "all") return "Todas as lojas";
  return getLocation(scope)?.name ?? scope;
}

function filterStore<T extends { locationId: string }>(rows: T[], scope: StoreScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => row.locationId === scope);
}

export function downloadCsv(filename: string, report: ReportTable) {
  const escape = (value: string | number) => {
    const text = String(value);
    if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [
    [report.title],
    [report.subtitle],
    [],
    report.headers,
    ...report.rows,
    ...(report.notes ?? []).map((note) => [note]),
  ].map((row) => row.map(escape).join(";"));
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}


export async function reportClosing(date: string, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const from = startOfDayIso(date);
  const to = endOfDayIso(date);
  const catalog = await catalogItems(false);
  const nicheById = new Map(catalog.map((item) => [item.niche.id, item]));
  const sales = filterStore(await db.sales.where("at").between(from, to, true, true).toArray(), scope);
  const wastes = filterStore(await db.wastes.where("at").between(from, to, true, true).toArray(), scope);
  const saleItems = (
    await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();

  const revenue = saleItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const cost = saleItems.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
  let wasteQty = 0;
  let wasteCost = 0;
  let wasteRevenue = 0;
  for (const row of wastes) {
    const moneyLost = wasteMoney(row.qty, nicheById.get(row.nicheId)?.niche, row.unitCost, row.unitPrice);
    wasteQty += row.qty;
    wasteCost += moneyLost.cost;
    wasteRevenue += moneyLost.revenue;
  }

  const pay = { dinheiro: 0, pix: 0, cartao: 0 };
  const channel = { caixa: 0, delivery: 0, encomenda: 0 };
  for (const sale of sales) {
    pay[sale.payment] += sale.total;
    channel[sale.channel] += sale.total;
  }

  const byStore = storeLocations()
    .filter((location) => scope === "all" || location.id === scope)
    .map((location) => {
      const storeSales = sales.filter((sale) => sale.locationId === location.id);
      const storeWaste = wastes.filter((row) => row.locationId === location.id);
      const items = saleItems.filter((item) => storeSales.some((sale) => sale.id === item.saleId));
      const rec = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
      const cst = items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
      const wqty = storeWaste.reduce((sum, row) => sum + row.qty, 0);
      const wrev = storeWaste.reduce((sum, row) => {
        const lost = wasteMoney(row.qty, nicheById.get(row.nicheId)?.niche, row.unitCost, row.unitPrice);
        return sum + lost.revenue;
      }, 0);
      return [
        location.name,
        storeSales.length,
        money(rec),
        money(rec - cst),
        `${wqty} un.`,
        money(wrev),
      ];
    });

  return {
    title: "Fechamento do dia",
    subtitle: `${formatDate(date)} · ${scopeName(scope)}`,
    headers: ["Loja", "Vendas", "Faturamento", "Lucro", "Sobra", "Sobra em R$"],
    rows: [
      ...byStore,
      ["TOTAL", sales.length, money(revenue), money(revenue - cost), `${wasteQty} un.`, money(wasteRevenue)],
    ],
    notes: [
      `Pagamentos: Dinheiro ${money(pay.dinheiro)} · Pix ${money(pay.pix)} · Cartão ${money(pay.cartao)}`,
      `Canais: Caixa ${money(channel.caixa)} · Delivery ${money(channel.delivery)} · Encomenda ${money(channel.encomenda)}`,
      `Custo das sobras (o que foi gasto para fazer): ${money(wasteCost)}`,
    ],
  };
}

export async function reportSales(period: Period, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const { from, to } = periodRange(period);
  const catalog = await catalogItems(false);
  const sales = filterStore(await db.sales.where("at").between(from, to, true, true).toArray(), scope);
  const saleItems = (
    await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();

  const byProduct = new Map<string, { label: string; qty: number; revenue: number; cost: number }>();
  for (const item of saleItems) {
    const found = catalog.find((row) => row.niche.id === item.nicheId);
    const label = found?.label ?? "Produto";
    const current = byProduct.get(item.nicheId) ?? { label, qty: 0, revenue: 0, cost: 0 };
    current.qty += item.qty;
    current.revenue += item.unitPrice * item.qty;
    current.cost += item.unitCost * item.qty;
    byProduct.set(item.nicheId, current);
  }

  const rows = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => [
      item.label,
      item.qty,
      money(item.revenue),
      money(item.revenue - item.cost),
    ]);

  const totalQty = rows.reduce((sum, row) => sum + Number(row[1]), 0);
  const totalRev = [...byProduct.values()].reduce((sum, item) => sum + item.revenue, 0);
  const totalMar = [...byProduct.values()].reduce((sum, item) => sum + (item.revenue - item.cost), 0);

  return {
    title: "Vendas por produto",
    subtitle: `${periodLabel(period)} · ${scopeName(scope)} · ${sales.length} vendas`,
    headers: ["Produto", "Unidades", "Faturamento", "Lucro"],
    rows: [...rows, ["TOTAL", totalQty, money(totalRev), money(totalMar)]],
  };
}

export async function reportWaste(period: Period, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const { from, to } = periodRange(period);
  const catalog = await catalogItems(false);
  const wastes = filterStore(await db.wastes.where("at").between(from, to, true, true).toArray(), scope);

  const byKey = new Map<string, { loja: string; label: string; qty: number; cost: number; revenue: number }>();
  for (const row of wastes) {
    const found = catalog.find((item) => item.niche.id === row.nicheId);
    const key = `${row.locationId}:${row.nicheId}`;
    const lost = wasteMoney(row.qty, found?.niche, row.unitCost, row.unitPrice);
    const current = byKey.get(key) ?? {
      loja: getLocation(row.locationId)?.name ?? row.locationId,
      label: found?.label ?? "Produto",
      qty: 0,
      cost: 0,
      revenue: 0,
    };
    current.qty += row.qty;
    current.cost += lost.cost;
    current.revenue += lost.revenue;
    byKey.set(key, current);
  }

  const rows = [...byKey.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => [item.loja, item.label, item.qty, money(item.cost), money(item.revenue)]);

  const totalQty = [...byKey.values()].reduce((sum, item) => sum + item.qty, 0);
  const totalCost = [...byKey.values()].reduce((sum, item) => sum + item.cost, 0);
  const totalRev = [...byKey.values()].reduce((sum, item) => sum + item.revenue, 0);

  return {
    title: "Perdas e sobras",
    subtitle: `${periodLabel(period)} · ${scopeName(scope)}`,
    headers: ["Loja", "Produto", "Unidades", "Custo jogado fora", "Deixou de vender"],
    rows: [...rows, ["TOTAL", "", totalQty, money(totalCost), money(totalRev)]],
  };
}

export async function reportTransfers(period: Period): Promise<ReportTable> {
  const db = getDb();
  const { from, to } = periodRange(period);
  const catalog = await catalogItems(false);
  const transfers = await db.transfers.where("at").between(from, to, true, true).toArray();
  const items = await db.transferItems.toArray();

  const rows: (string | number)[][] = [];
  for (const transfer of transfers.sort((a, b) => a.at.localeCompare(b.at))) {
    const dest = getLocation(transfer.toLocationId)?.name ?? transfer.toLocationId;
    const parts = items.filter((item) => item.transferId === transfer.id);
    if (parts.length === 0) {
      rows.push([formatDate(transfer.at.slice(0, 10)), formatTime(transfer.at), dest, "—", 0]);
      continue;
    }
    for (const part of parts) {
      const found = catalog.find((item) => item.niche.id === part.nicheId);
      rows.push([
        formatDate(transfer.at.slice(0, 10)),
        formatTime(transfer.at),
        dest,
        found?.label ?? "Produto",
        part.qty,
      ]);
    }
  }

  return {
    title: "Envios da fábrica para as lojas",
    subtitle: periodLabel(period),
    headers: ["Data", "Hora", "Loja", "Produto", "Quantidade"],
    rows,
    notes: rows.length === 0 ? ["Nenhum envio neste período."] : undefined,
  };
}

export async function reportStock(): Promise<ReportTable> {
  const stock = await stockByLocation();
  return {
    title: "Estoque atual",
    subtitle: `Foto de ${new Date().toLocaleString("pt-BR")}`,
    headers: ["Produto", "Fábrica", "Mín. fábrica", "Loja 1", "Mín. loja", "Loja 2"],
    rows: stock.map((item) => {
      const factory = item.qty.factory ?? 0;
      const s1 = item.qty.store_1 ?? 0;
      const s2 = item.qty.store_2 ?? 0;
      const fMin = factoryMin(item.niche);
      const sMin = storeMin(item.niche);
      return [
        item.label,
        factory <= fMin ? `${factory} (baixo)` : factory,
        fMin,
        s1 <= sMin ? `${s1} (baixo)` : s1,
        sMin,
        s2 <= sMin ? `${s2} (baixo)` : s2,
      ];
    }),
    notes: [
      `Unidades: Fábrica ${LOCATIONS.filter((l) => l.id === "factory").length ? stock.reduce((s, i) => s + (i.qty.factory ?? 0), 0) : 0} · Loja 1 ${stock.reduce((s, i) => s + (i.qty.store_1 ?? 0), 0)} · Loja 2 ${stock.reduce((s, i) => s + (i.qty.store_2 ?? 0), 0)}`,
    ],
  };
}

export function fileName(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
}
