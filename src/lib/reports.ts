import { getDb } from "./db";
import { getLocation, storeLocations } from "./locations";
import {
  addDays,
  endOfDayIso,
  formatBRL,
  formatDate,
  formatTime,
  periodRange,
  startOfDayIso,
  todayDate,
  type Period,
} from "./money";
import { cashDifferenceLabel, cashPeriodLabel, sessionLedger } from "./cash";
import { personLocation } from "./people";
import { catalogItems, listProductionLogs, stockByLocation } from "./queries";
import { factoryMin, storeMin } from "./stock-min";
import type { Niche } from "./types";
import { adjustmentReasonLabel, cashDestinationLabel, isLiveSale, lotCost, lotPrice, receivedQtyOf, salePayments, transferKind, transferStatus, transferStatusLabel } from "./types";

export type StoreScope = "all" | string;

export type WhenKind = Period | "range";

export type ReportPresetId = "today" | "yesterday" | "week" | "month";

export function reportDatePresets(today = todayDate()) {
  return [
    { id: "today" as const, label: "Hoje", from: today, to: today },
    { id: "yesterday" as const, label: "Ontem", from: addDays(today, -1), to: addDays(today, -1) },
    { id: "week" as const, label: "Últimos 7 dias", from: addDays(today, -6), to: today },
    { id: "month" as const, label: "Últimos 30 dias", from: addDays(today, -29), to: today },
  ];
}

export function matchReportPreset(from: string, to: string, today = todayDate()) {
  return reportDatePresets(today).find((preset) => preset.from === from && preset.to === to)?.id ?? null;
}

export function clampReportDate(value: string, today = todayDate()) {
  if (!value) return today;
  return value > today ? today : value;
}

export function orderedReportDates(from: string, to: string, today = todayDate()) {
  const start = clampReportDate(from, today);
  const end = clampReportDate(to, today);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

export type ReportWindow = {
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
  label: string;
};

export type ReportTable = {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  notes?: string[];
};

export function reportWindow(kind: WhenKind, range?: { from: string; to: string }): ReportWindow {
  if (kind === "range") {
    const start = range?.from || todayDate();
    const end = range?.to || todayDate();
    const fromDate = start <= end ? start : end;
    const toDate = start <= end ? end : start;
    return {
      from: startOfDayIso(fromDate),
      to: endOfDayIso(toDate),
      fromDate,
      toDate,
      label: fromDate === toDate ? formatDate(fromDate) : `${formatDate(fromDate)} a ${formatDate(toDate)}`,
    };
  }
  if (kind === "today") {
    const day = todayDate();
    return {
      from: startOfDayIso(day),
      to: endOfDayIso(day),
      fromDate: day,
      toDate: day,
      label: `Dia ${formatDate(day)}`,
    };
  }
  const { from, to, days } = periodRange(kind);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const offset = start.getTimezoneOffset() * 60_000;
  const fromDate = new Date(start.getTime() - offset).toISOString().slice(0, 10);
  return {
    from,
    to,
    fromDate,
    toDate: todayDate(),
    label: kind === "week" ? "Últimos 7 dias" : "Últimos 30 dias",
  };
}

function money(value: number) {
  return formatBRL(value);
}

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${((part / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function wasteMoney(qty: number, niche?: Niche, unitCost?: number, unitPrice?: number) {
  const cost = unitCost ?? niche?.costPrice ?? 0;
  const price = unitPrice ?? niche?.sellPrice ?? 0;
  return { cost: qty * cost, revenue: qty * price };
}

function scopeName(scope: StoreScope) {
  if (scope === "all") return "Rede (fábrica e lojas)";
  if (scope === "factory") return "Fábrica";
  return getLocation(scope)?.name ?? scope;
}

function filterStore<T extends { locationId: string }>(rows: T[], scope: StoreScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => row.locationId === scope);
}

function liveSales<T extends { locationId: string; voidedAt?: string }>(rows: T[], scope: StoreScope) {
  return filterStore(rows, scope).filter(isLiveSale);
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

export async function reportClosing(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const nicheById = new Map(catalog.map((item) => [item.niche.id, item]));
  const sales = liveSales(await db.sales.where("at").between(window.from, window.to, true, true).toArray(), scope);
  const wastes = filterStore(await db.wastes.where("at").between(window.from, window.to, true, true).toArray(), scope);
  const consumptions = filterStore(
    await db.consumptions.where("at").between(window.from, window.to, true, true).toArray(),
    scope,
  );
  const saleItems = (
    await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();

  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cost = saleItems.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
  const soldQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
  let leftoverQty = 0;
  let leftoverCost = 0;
  let leftoverRevenue = 0;
  let expiredQty = 0;
  let expiredCost = 0;
  let expiredRevenue = 0;
  for (const row of wastes) {
    const moneyLost = wasteMoney(row.qty, nicheById.get(row.nicheId)?.niche, row.unitCost, row.unitPrice);
    if (row.reason === "vencido") {
      expiredQty += row.qty;
      expiredCost += moneyLost.cost;
      expiredRevenue += moneyLost.revenue;
      continue;
    }
    if (row.reason === "devolucao") continue;
    leftoverQty += row.qty;
    leftoverCost += moneyLost.cost;
    leftoverRevenue += moneyLost.revenue;
  }
  const wasteQty = leftoverQty + expiredQty;
  const wasteCost = leftoverCost + expiredCost;
  const wasteRevenue = leftoverRevenue + expiredRevenue;
  const consumeQty = consumptions.reduce((sum, row) => sum + row.qty, 0);
  const lots = await db.lots.bulkGet(consumptions.map((row) => row.lotId));
  const consumeCost = consumptions.reduce((sum, row, index) => {
    const niche = nicheById.get(row.nicheId)?.niche;
    return sum + row.qty * (row.unitCost ?? lotCost(lots[index], niche?.costPrice ?? 0));
  }, 0);

  const pay = { dinheiro: 0, pix: 0, cartao: 0 };
  const channel = { caixa: 0, delivery: 0, encomenda: 0 };
  for (const sale of sales) {
    for (const row of salePayments(sale)) {
      pay[row.method] += row.amount;
    }
    channel[sale.channel] += sale.total;
  }

  const byStore = storeLocations()
    .filter((location) => scope === "all" || location.id === scope)
    .map((location) => {
      const storeSales = sales.filter((sale) => sale.locationId === location.id);
      const storeWaste = wastes.filter((row) => row.locationId === location.id);
      const storeConsume = consumptions.filter((row) => row.locationId === location.id);
      const items = saleItems.filter((item) => storeSales.some((sale) => sale.id === item.saleId));
      const rec = storeSales.reduce((sum, sale) => sum + sale.total, 0);
      const cst = items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
      const qtySold = items.reduce((sum, item) => sum + item.qty, 0);
      const leftover = storeWaste
        .filter((row) => row.reason !== "vencido" && row.reason !== "devolucao")
        .reduce((sum, row) => sum + row.qty, 0);
      const expired = storeWaste.filter((row) => row.reason === "vencido").reduce((sum, row) => sum + row.qty, 0);
      const wrev = storeWaste.reduce((sum, row) => {
        const lost = wasteMoney(row.qty, nicheById.get(row.nicheId)?.niche, row.unitCost, row.unitPrice);
        return sum + lost.revenue;
      }, 0);
      const consume = storeConsume.reduce((sum, row) => sum + row.qty, 0);
      return [
        location.name,
        storeSales.length,
        qtySold,
        money(rec),
        money(cst),
        money(rec - cst),
        pct(rec - cst, rec),
        storeSales.length ? money(rec / storeSales.length) : "—",
        leftover,
        expired,
        consume,
        pct(leftover + expired, qtySold + leftover + expired),
        money(wrev),
      ];
    });

  return {
    title: "Fechamento operacional",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: [
      "Loja",
      "Cupons",
      "Un. vendidas",
      "Faturamento",
      "Custo do que vendeu",
      "Lucro",
      "Margem",
      "Ticket médio",
      "Sobra un.",
      "Vencido un.",
      "Consumo un.",
      "Taxa de perda",
      "Perda R$",
    ],
    rows: [
      ...byStore,
      [
        "TOTAL",
        sales.length,
        soldQty,
        money(revenue),
        money(cost),
        money(revenue - cost),
        pct(revenue - cost, revenue),
        sales.length ? money(revenue / sales.length) : "—",
        leftoverQty,
        expiredQty,
        consumeQty,
        pct(wasteQty, soldQty + wasteQty),
        money(wasteRevenue),
      ],
    ],
    notes: [
      `Pagamentos: Dinheiro ${money(pay.dinheiro)} (${pct(pay.dinheiro, revenue)}) · Pix ${money(pay.pix)} (${pct(pay.pix, revenue)}) · Cartão ${money(pay.cartao)} (${pct(pay.cartao, revenue)})`,
      `Canais: Caixa ${money(channel.caixa)} · Delivery ${money(channel.delivery)} · Encomenda ${money(channel.encomenda)}`,
      `Custo do que vendeu. Taxa de perda = (sobra + vencido) ÷ (vendido + sobra + vencido).`,
      `Custo da sobra ${money(leftoverCost)} · custo do vencido ${money(expiredCost)} · custo do consumo interno ${money(consumeCost)} · perdas totais ${money(wasteCost)}`,
      wasteQty > 0
        ? `Deixou de vender ${money(wasteRevenue)} com sobra e validade. Isso não entra no faturamento.`
        : "Nenhuma perda de sobra ou validade neste recorte.",
    ],
  };
}

export async function reportSales(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const sales = liveSales(await db.sales.where("at").between(window.from, window.to, true, true).toArray(), scope);
  const saleItems = (
    await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();

  const byProduct = new Map<
    string,
    { label: string; qty: number; revenue: number; cost: number; promoQty: number }
  >();
  for (const item of saleItems) {
    const found = catalog.find((row) => row.niche.id === item.nicheId);
    const current = byProduct.get(item.nicheId) ?? {
      label: found?.label ?? "Produto",
      qty: 0,
      revenue: 0,
      cost: 0,
      promoQty: 0,
    };
    current.qty += item.qty;
    current.revenue += item.unitPrice * item.qty;
    current.cost += item.unitCost * item.qty;
    if (item.promo) current.promoQty += item.qty;
    byProduct.set(item.nicheId, current);
  }

  const totalQty = [...byProduct.values()].reduce((sum, item) => sum + item.qty, 0);
  const totalRev = [...byProduct.values()].reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = [...byProduct.values()].reduce((sum, item) => sum + item.cost, 0);
  const totalPromo = [...byProduct.values()].reduce((sum, item) => sum + item.promoQty, 0);

  const rows = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((item) => [
      item.label,
      item.qty,
      money(item.qty ? item.revenue / item.qty : 0),
      money(item.revenue),
      money(item.cost),
      money(item.revenue - item.cost),
      pct(item.revenue - item.cost, item.revenue),
      pct(item.revenue, totalRev),
      item.promoQty,
    ]);

  return {
    title: "Vendas por produto",
    subtitle: `${window.label} · ${scopeName(scope)} · ${sales.length} cupons · ${totalQty} un.`,
    headers: [
      "Produto",
      "Unidades",
      "Preço médio",
      "Faturamento",
      "Custo do que vendeu",
      "Lucro",
      "Margem",
      "Part. fat.",
      "Un. em promo",
    ],
    rows: [
      ...rows,
      ["TOTAL", totalQty, "—", money(totalRev), money(totalCost), money(totalRev - totalCost), pct(totalRev - totalCost, totalRev), "100%", totalPromo],
    ],
    notes: [
      sales.length ? `Ticket médio ${money(totalRev / sales.length)} · ${totalQty} unidades em ${sales.length} vendas.` : "Nenhuma venda neste recorte.",
      "Uma venda pode misturar Pix, dinheiro e cartão. O caixa só conta a parte em dinheiro no esperado em espécie.",
    ],
  };
}

export async function reportWaste(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const wastes = filterStore(await db.wastes.where("at").between(window.from, window.to, true, true).toArray(), scope);
  const sales = liveSales(await db.sales.where("at").between(window.from, window.to, true, true).toArray(), scope);
  const saleItems = (
    await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();
  const soldQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
  const soldRev = saleItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  const byKey = new Map<
    string,
    { loja: string; label: string; reason: string; qty: number; cost: number; revenue: number }
  >();
  for (const row of wastes) {
    const found = catalog.find((item) => item.niche.id === row.nicheId);
    const lost = wasteMoney(row.qty, found?.niche, row.unitCost, row.unitPrice);
    const reason = row.reason === "vencido" ? "Vencido" : row.reason === "devolucao" ? "Devolução" : "Sobra";
    const key = `${row.locationId}:${row.nicheId}:${reason}`;
    const current = byKey.get(key) ?? {
      loja: getLocation(row.locationId)?.name ?? row.locationId,
      label: found?.label ?? "Produto",
      reason,
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
    .map((item) => [
      item.loja,
      item.label,
      item.reason,
      item.qty,
      money(item.qty ? item.cost / item.qty : 0),
      money(item.cost),
      money(item.revenue),
      pct(item.qty, soldQty + [...byKey.values()].reduce((sum, row) => sum + row.qty, 0)),
    ]);

  const totalQty = [...byKey.values()].reduce((sum, item) => sum + item.qty, 0);
  const totalCost = [...byKey.values()].reduce((sum, item) => sum + item.cost, 0);
  const totalRev = [...byKey.values()].reduce((sum, item) => sum + item.revenue, 0);
  const leftoverQty = [...byKey.values()].filter((item) => item.reason === "Sobra").reduce((sum, item) => sum + item.qty, 0);
  const expiredQty = [...byKey.values()].filter((item) => item.reason === "Vencido").reduce((sum, item) => sum + item.qty, 0);

  return {
    title: "Perdas, sobras e descartes",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: ["Loja", "Produto", "Motivo", "Unidades", "Custo un.", "Custo jogado fora", "Deixou de vender", "% do volume"],
    rows: [...rows, ["TOTAL", "", "", totalQty, "—", money(totalCost), money(totalRev), pct(totalQty, soldQty + totalQty)]],
    notes: [
      `Sobra do dia ${leftoverQty} un. · descarte por validade ${expiredQty} un.`,
      `Perda sobre o que saiu (vendido + perda): ${pct(totalQty, soldQty + totalQty)} em unidades · ${pct(totalRev, soldRev + totalRev)} em reais.`,
      "Sobra é produto frito que não vendeu. Vencido é lote que passou da validade e foi descartado.",
    ],
  };
}

export async function reportTransfers(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const transfers = (await db.transfers.where("at").between(window.from, window.to, true, true).toArray()).filter(
    (transfer) =>
      transferKind(transfer) === "envio" &&
      (scope === "all" || scope === "factory" || transfer.toLocationId === scope),
  );
  const items = await db.transferItems.toArray();
  const lots = await db.lots.toArray();
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));

  const rows: (string | number)[][] = [];
  let totalQty = 0;
  let totalCost = 0;
  for (const transfer of transfers.sort((a, b) => a.at.localeCompare(b.at))) {
    const dest = getLocation(transfer.toLocationId)?.name ?? transfer.toLocationId;
    const situation = transferStatusLabel(transferStatus(transfer));
    const parts = items.filter((item) => item.transferId === transfer.id);
    if (parts.length === 0) {
      rows.push([formatDate(transfer.at.slice(0, 10)), formatTime(transfer.at), dest, situation, "—", 0, 0, "—", money(0)]);
      continue;
    }
    for (const part of parts) {
      const found = catalog.find((item) => item.niche.id === part.nicheId);
      const lot = lotById.get(part.lotId);
      const arrived = receivedQtyOf(part, transferStatus(transfer)) ?? 0;
      const cost = part.qty * lotCost(lot, found?.niche.costPrice ?? 0);
      totalQty += part.qty;
      totalCost += cost;
      rows.push([
        formatDate(transfer.at.slice(0, 10)),
        formatTime(transfer.at),
        dest,
        situation,
        found?.label ?? "Produto",
        part.qty,
        arrived,
        lot?.expiresAt ? formatDate(lot.expiresAt) : "Sem validade",
        money(cost),
      ]);
    }
  }

  return {
    title: "Envios da fábrica para as lojas",
    subtitle: `${window.label}${scope === "all" ? "" : ` · destino ${scopeName(scope)}`}`,
    headers: ["Data", "Hora", "Loja", "Situação", "Produto", "Mandou", "Chegou", "Validade do lote", "Custo enviado"],
    rows: rows.length ? [...rows, ["TOTAL", "", "", "", "", totalQty, "", "", money(totalCost)]] : rows,
    notes: [
      rows.length === 0 ? "Nenhum envio neste recorte." : `${totalQty} un. saíram da fábrica · custo de reposição ${money(totalCost)}.`,
      "Mandou é o que saiu da fábrica. Chegou é o que a loja conferiu. O que faltou volta para a câmara. Em trânsito ainda não é estoque da loja.",
      "Para o papel que vai com o motorista, use o romaneio do envio em Mandar para a loja.",
    ],
  };
}

export async function reportRomaneio(transferId: string): Promise<ReportTable> {
  const db = getDb();
  const transfer = await db.transfers.get(transferId);
  if (!transfer) {
    return {
      title: "Romaneio",
      subtitle: "Envio não encontrado",
      headers: ["Produto", "Lote", "Validade", "Quantidade"],
      rows: [],
      notes: ["Este envio não existe mais."],
    };
  }
  if (transferKind(transfer) === "devolucao") {
    return {
      title: "Romaneio",
      subtitle: "Esta é uma devolução, não um envio da câmara.",
      headers: ["Produto", "Lote", "Validade", "Quantidade"],
      rows: [],
    };
  }

  const [items, catalog, lots] = await Promise.all([
    db.transferItems.where("transferId").equals(transfer.id).toArray(),
    catalogItems(false),
    db.lots.toArray(),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const dest = getLocation(transfer.toLocationId)?.name ?? transfer.toLocationId;
  let totalQty = 0;
  const rows: (string | number)[][] = [];

  for (const part of items) {
    const found = catalog.find((item) => item.niche.id === part.nicheId);
    const lot = lotById.get(part.lotId);
    totalQty += part.qty;
    rows.push([
      found?.label ?? "Produto",
      lot?.madeAt ? formatDate(lot.madeAt) : "—",
      lot?.expiresAt ? formatDate(lot.expiresAt) : "Sem validade",
      part.qty,
    ]);
  }

  return {
    title: `Romaneio — ${dest}`,
    subtitle: `Saiu da câmara ${formatDate(transfer.at)} às ${formatTime(transfer.at)} · Expedido por ${transfer.sentBy?.trim() || "Fábrica"} · ${transferStatusLabel(transferStatus(transfer))}`,
    headers: ["Produto", "Lote feito em", "Validade", "Quantidade"],
    rows: rows.length ? [...rows, ["TOTAL", "", "", totalQty]] : rows,
    notes: [
      "Este papel é o que saiu da câmara. Ainda não é estoque da loja até ela conferir em Receber.",
      "Não é venda. Não é romaneio de devolução.",
    ],
  };
}

export async function reportStock(scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const [stock, stockRows, lots] = await Promise.all([stockByLocation(), db.stock.toArray(), db.lots.toArray()]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const locations =
    scope === "all"
      ? [{ id: "factory", name: "Fábrica", type: "factory" as const }, ...storeLocations()]
      : storeLocations().filter((location) => location.id === scope);

  const rows: (string | number)[][] = [];
  let units = 0;
  let sellable = 0;
  let expired = 0;
  let value = 0;
  let expiredValue = 0;
  let sellValue = 0;

  for (const location of locations) {
    for (const item of stock) {
      const qty = item.qty[location.id] ?? 0;
      const expiredQty = item.expiredQty[location.id] ?? 0;
      const valid = Math.max(0, qty - expiredQty);
      if (qty <= 0) continue;
      const min = location.id === "factory" ? factoryMin(item.niche) : storeMin(item.niche);
      const low = valid <= min;
      const status = expiredQty > 0 ? "Tem vencido" : low ? "Abaixo do mínimo" : "Ok";
      const here = stockRows.filter(
        (row) => row.locationId === location.id && row.nicheId === item.niche.id && row.qty > 0,
      );
      const stockValue = here.reduce(
        (sum, row) => sum + row.qty * lotCost(lotById.get(row.lotId), item.niche.costPrice),
        0,
      );
      const expiredValueHere = here.reduce((sum, row) => {
        const lot = lotById.get(row.lotId);
        if (!lot?.expiresAt || lot.expiresAt >= todayDate()) return sum;
        return sum + row.qty * lotCost(lot, item.niche.costPrice);
      }, 0);
      const validSaleValue = here.reduce((sum, row) => {
        const lot = lotById.get(row.lotId);
        if (lot?.expiresAt && lot.expiresAt < todayDate()) return sum;
        return sum + row.qty * lotPrice(lot, item.niche.sellPrice);
      }, 0);
      const cost = qty ? stockValue / qty : item.niche.costPrice;
      const price = valid ? validSaleValue / valid : item.niche.sellPrice;
      units += qty;
      sellable += valid;
      expired += expiredQty;
      value += stockValue;
      expiredValue += expiredValueHere;
      sellValue += validSaleValue;
      rows.push([
        location.name,
        item.label,
        qty,
        valid,
        expiredQty,
        min,
        status,
        money(cost),
        money(qty * cost),
        money(price),
        money(valid * price),
      ]);
    }
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR") || String(a[1]).localeCompare(String(b[1]), "pt-BR"));

  return {
    title: "Posição de estoque",
    subtitle: `Foto de ${new Date().toLocaleString("pt-BR")}${scope === "all" ? " · fábrica e lojas" : ` · ${scopeName(scope)}`}`,
    headers: [
      "Local",
      "Produto",
      "Qtd",
      "Válidas",
      "Vencidas",
      "Mínimo",
      "Situação",
      "Custo un.",
      "Valor estoque",
      "Preço un.",
      "Valor de venda",
    ],
    rows: [
      ...rows,
      ["TOTAL", "", units, sellable, expired, "", "", "", money(value), "", money(sellValue)],
    ],
    notes: [
      `Valor de estoque (custo) ${money(value)} · disso ${money(expiredValue)} está vencido.`,
      `Se vender o que ainda vale: ${money(sellValue)}. Lote vencido não entra nessa conta.`,
      "Custo un. e preço un. são do lote (média se houver mais de um). Mudar o tipo só vale para o próximo lote.",
      "Mínimo é o ponto de reposição. Abaixo dele a loja precisa pedir e a fábrica precisa produzir.",
    ],
  };
}

export async function reportProduction(window: ReportWindow): Promise<ReportTable> {
  const logs = await listProductionLogs(1000);
  const inWindow = logs.filter((log) => log.at >= window.from && log.at <= window.to);
  const rows: (string | number)[][] = [];
  let total = 0;
  for (const log of inWindow) {
    for (const item of log.items) {
      total += item.qty;
      rows.push([
        formatDate(log.madeAt),
        formatDate(log.at.slice(0, 10)),
        formatTime(log.at),
        item.label,
        item.qty,
        item.expiresAt ? formatDate(item.expiresAt) : "Sem validade",
      ]);
    }
  }

  return {
    title: "Produção da fábrica",
    subtitle: window.label,
    headers: ["Feito em", "Lançado em", "Hora", "Produto", "Quantidade", "Validade"],
    rows: rows.length ? [...rows, ["TOTAL", "", "", "", total, ""]] : rows,
    notes: [
      rows.length === 0 ? "Nenhuma produção neste recorte." : `${total} un. entraram no estoque da fábrica.`,
      "A data 'feito em' é a do lote. Use o registro de produção para filtrar um dia específico.",
    ],
  };
}

export async function reportInternal(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const [users, allLots] = await Promise.all([db.employees.toArray(), db.lots.toArray()]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const lotById = new Map(allLots.map((lot) => [lot.id, lot]));
  const rows = filterStore(
    await db.consumptions.where("at").between(window.from, window.to, true, true).toArray(),
    scope,
  ).sort((a, b) => a.at.localeCompare(b.at));

  let qty = 0;
  let cost = 0;
  const table = rows.map((row) => {
    const found = catalog.find((item) => item.niche.id === row.nicheId);
    const unitCost = row.unitCost ?? lotCost(lotById.get(row.lotId), found?.niche.costPrice ?? 0);
    const person = row.userId ? userById.get(row.userId) : undefined;
    const origin = person && personLocation(person) === "factory" ? "Fábrica" : "Loja";
    qty += row.qty;
    cost += row.qty * unitCost;
    return [
      formatDate(row.dayKey),
      formatTime(row.at),
      getLocation(row.locationId)?.name ?? row.locationId,
      row.userName ?? "—",
      origin,
      found?.label ?? "Produto",
      row.qty,
      money(unitCost),
      money(row.qty * unitCost),
    ];
  });

  const people = new Set(rows.map((row) => row.userId ?? row.userName)).size;

  return {
    title: "Consumo interno",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: ["Data", "Hora", "Loja", "Funcionário", "Origem", "Produto", "Unidades", "Custo un.", "Custo total"],
    rows: table.length ? [...table, ["TOTAL", "", "", "", "", "", qty, "", money(cost)]] : table,
    notes: [
      table.length === 0
        ? "Nenhum consumo interno neste recorte."
        : `${qty} un. · ${people} pessoas · custo ${money(cost)}. Saiu do estoque da loja, não da fábrica.`,
      "Origem Fábrica = funcionário da fábrica que retirou 1× ao dia em alguma loja.",
      "Cada pessoa tem teto diário no produto. Se houver cota de grupo (ex.: 3 salgados locais), a soma conta. O teto da loja é o global. Consumo só com caixa aberto.",
    ],
  };
}

export async function reportCash(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const sessions = filterStore(await db.cashSessions.toArray(), scope)
    .filter((session) => session.openedAt >= window.from && session.openedAt <= window.to)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));

  const ledgers = await Promise.all(sessions.map((session) => sessionLedger(session.id)));
  const rows = ledgers.map((ledger) => [
    getLocation(ledger.session.locationId)?.name ?? ledger.session.locationId,
    formatDate(ledger.session.openedAt.slice(0, 10)),
    cashPeriodLabel(ledger.session.period),
    ledger.session.employeeName,
    ledger.session.closedAt
      ? ledger.session.reopenedAt
        ? "Encerrado (reabriu)"
        : "Encerrado"
      : ledger.session.reopenedAt
        ? "Reaberto"
        : "Aberto",
    money(ledger.openingAmount),
    money(ledger.byPayment.dinheiro),
    money(ledger.byPayment.pix),
    money(ledger.byPayment.cartao),
    money(ledger.supplyTotal),
    money(ledger.sangriaTotal),
    money(ledger.expectedCash),
    ledger.countedCash != null ? money(ledger.countedCash) : "—",
    ledger.difference != null ? money(ledger.difference) : "—",
    ledger.difference != null ? cashDifferenceLabel(ledger.difference) : "—",
    ledger.session.recountedBy
      ? `${ledger.session.recountedBy}${ledger.session.secondCount != null ? ` · 2ª ${money(ledger.session.secondCount)}` : ""}`
      : ledger.difference != null && Math.abs(ledger.difference) >= 0.005
        ? "Sem 2ª contagem"
        : "—",
  ]);

  const closed = ledgers.filter((item) => item.difference != null);
  const totalDiff = closed.reduce((sum, item) => sum + (item.difference ?? 0), 0);
  const totalCash = ledgers.reduce((sum, item) => sum + item.byPayment.dinheiro, 0);
  const totalSangria = ledgers.reduce((sum, item) => sum + item.sangriaTotal, 0);

  return {
    title: "Conferência de caixa",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: [
      "Loja",
      "Data",
      "Turno",
      "Operador",
      "Situação",
      "Fundo de caixa",
      "Vendas em espécie",
      "Pix",
      "Cartão",
      "Suprimento",
      "Sangria",
      "Saldo esperado",
      "Dinheiro apurado",
      "Diferença",
      "Resultado",
      "2ª contagem / conferido por",
    ],
    rows: rows.length
      ? [
          ...rows,
          [
            "TOTAL",
            "",
            "",
            "",
            "",
            money(ledgers.reduce((sum, item) => sum + item.openingAmount, 0)),
            money(totalCash),
            money(ledgers.reduce((sum, item) => sum + item.byPayment.pix, 0)),
            money(ledgers.reduce((sum, item) => sum + item.byPayment.cartao, 0)),
            money(ledgers.reduce((sum, item) => sum + item.supplyTotal, 0)),
            money(totalSangria),
            money(ledgers.reduce((sum, item) => sum + item.expectedCash, 0)),
            money(closed.reduce((sum, item) => sum + (item.countedCash ?? 0), 0)),
            money(totalDiff),
            closed.length ? cashDifferenceLabel(totalDiff) : "—",
            "",
          ],
        ]
      : rows,
    notes: [
      rows.length === 0
        ? "Nenhum caixa aberto neste recorte."
        : `${sessions.length} movimentos · ${closed.length} encerrados · diferença acumulada ${money(totalDiff)}.`,
      "Saldo esperado em espécie = fundo + a parte em dinheiro das vendas + suprimento − sangria. Pix e cartão não entram na gaveta.",
      "Venda mista (Pix + dinheiro) só joga no esperado a fatia em espécie.",
      "Quebra = apurado menor que o esperado. Sobra = apurado maior. Caixa bateu = diferença zero.",
      "Quebra ou sobra exige segunda contagem e o nome de quem conferiu. Sem isso o turno não fecha.",
      ...reopenNotes(ledgers),
      ...sangriaNotes(ledgers),
    ],
  };
}

function sangriaNotes(ledgers: Awaited<ReturnType<typeof sessionLedger>>[]) {
  const moves = ledgers.flatMap((ledger) =>
    ledger.movements
      .filter((item) => item.type === "sangria")
      .map((item) => ({
        store: getLocation(ledger.session.locationId)?.name ?? ledger.session.locationId,
        period: cashPeriodLabel(ledger.session.period),
        amount: item.amount,
        destination: cashDestinationLabel(item.destination),
        reason: item.reason,
      })),
  );
  if (moves.length === 0) return ["Nenhuma sangria neste recorte."];
  const cofre = moves.filter((item) => item.destination === "Cofre").reduce((sum, item) => sum + item.amount, 0);
  const deposito = moves.filter((item) => item.destination === "Depósito").reduce((sum, item) => sum + item.amount, 0);
  return [
    `Sangria com destino: cofre ${money(cofre)} · depósito ${money(deposito)}. Não existe sangria para lugar nenhum.`,
    ...moves.slice(0, 12).map(
      (item) => `${item.store} · ${item.period} · ${money(item.amount)} · ${item.destination} · ${item.reason}`,
    ),
  ];
}

function reopenNotes(ledgers: Awaited<ReturnType<typeof sessionLedger>>[]) {
  const rows = ledgers.filter((ledger) => ledger.session.reopenedAt);
  if (rows.length === 0) return [];
  return [
    `${rows.length} caixa${rows.length === 1 ? "" : "s"} reaberto${rows.length === 1 ? "" : "s"} neste recorte. A reabertura fica no turno — não inventa sangria.`,
    ...rows.slice(0, 8).map((ledger) => {
      const store = getLocation(ledger.session.locationId)?.name ?? ledger.session.locationId;
      return `${store} · ${cashPeriodLabel(ledger.session.period)} · ${ledger.session.reopenNote ?? "sem motivo"}`;
    }),
  ];
}

export async function reportInventory(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const catalog = await catalogItems(false);
  const counts = (await db.inventoryCounts.toArray())
    .filter((row) => row.at >= window.from && row.at <= window.to)
    .filter((row) => scope === "all" || row.locationId === scope)
    .sort((a, b) => a.at.localeCompare(b.at));
  const lines = await db.inventoryLines.toArray();
  const labelByNiche = new Map(catalog.map((item) => [item.niche.id, item.label]));

  const rows: (string | number)[][] = [];
  let system = 0;
  let counted = 0;
  for (const count of counts) {
    const parts = lines.filter((line) => line.countId === count.id);
    if (parts.length === 0) {
      rows.push([
        formatDate(count.at.slice(0, 10)),
        formatTime(count.at),
        getLocation(count.locationId)?.name ?? count.locationId,
        count.countedBy,
        "—",
        0,
        0,
        0,
        "—",
      ]);
      continue;
    }
    for (const line of parts) {
      const delta = line.countedQty - line.systemQty;
      system += line.systemQty;
      counted += line.countedQty;
      rows.push([
        formatDate(count.at.slice(0, 10)),
        formatTime(count.at),
        getLocation(count.locationId)?.name ?? count.locationId,
        count.countedBy,
        labelByNiche.get(line.nicheId) ?? "Produto",
        line.systemQty,
        line.countedQty,
        delta,
        adjustmentReasonLabel(line.reason),
      ]);
    }
  }

  return {
    title: "Inventário e ajuste",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: ["Data", "Hora", "Local", "Responsável", "Produto", "Sistema", "Físico", "Diferença", "Motivo"],
    rows: rows.length ? [...rows, ["TOTAL", "", "", "", "", system, counted, counted - system, ""]] : rows,
    notes: [
      rows.length === 0
        ? "Nenhum inventário neste recorte."
        : `${counts.length} contagem${counts.length === 1 ? "" : "s"} · diferença ${counted - system}.`,
      "Diferença negativa = faltou no físico. Positiva = apareceu a mais. Motivo fica no lançamento.",
      "Ajuste não é venda nem sobra. O saldo do estoque já foi corrigido na hora da contagem.",
      "Diferença maior que 5 pede 2ª contagem e o nome de quem conferiu — o mesmo ritual do caixa.",
    ],
  };
}

export async function reportDayPack(window: ReportWindow, scope: StoreScope): Promise<ReportTable> {
  const db = getDb();
  const [sales, wastes, consumptions, sessions, transfers, transferItems, counts, lines, movements] = await Promise.all([
    liveSales(await db.sales.where("at").between(window.from, window.to, true, true).toArray(), scope),
    filterStore(await db.wastes.where("at").between(window.from, window.to, true, true).toArray(), scope),
    filterStore(await db.consumptions.where("at").between(window.from, window.to, true, true).toArray(), scope),
    filterStore(await db.cashSessions.toArray(), scope).filter(
      (session) => session.openedAt >= window.from && session.openedAt <= window.to,
    ),
    db.transfers.where("at").between(window.from, window.to, true, true).toArray(),
    db.transferItems.toArray(),
    db.inventoryCounts.toArray(),
    db.inventoryLines.toArray(),
    filterStore(await db.movements.where("at").between(window.from, window.to, true, true).toArray(), scope),
  ]);

  const ledgers = await Promise.all(sessions.map((session) => sessionLedger(session.id)));
  const saleItems = (await Promise.all(sales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))).flat();
  const soldQty = saleItems.reduce((sum, item) => sum + item.qty, 0);
  const soldRev = saleItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const leftover = wastes.filter((row) => row.reason === "sobra_frito");
  const expired = wastes.filter((row) => row.reason === "vencido");
  const leftoverQty = leftover.reduce((sum, row) => sum + row.qty, 0);
  const expiredQty = expired.reduce((sum, row) => sum + row.qty, 0);
  const consumeQty = consumptions.reduce((sum, row) => sum + row.qty, 0);
  const packQty = movements
    .filter((row) => row.type === "uso")
    .reduce((sum, row) => sum + Math.abs(row.qty), 0);
  const clienteQty = movements
    .filter((row) => row.type === "cliente")
    .reduce((sum, row) => sum + Math.abs(row.qty), 0);

  const dinheiro = ledgers.reduce((sum, ledger) => sum + ledger.byPayment.dinheiro, 0);
  const pix = ledgers.reduce((sum, ledger) => sum + ledger.byPayment.pix, 0);
  const cartao = ledgers.reduce((sum, ledger) => sum + ledger.byPayment.cartao, 0);
  const sangria = ledgers.reduce((sum, ledger) => sum + ledger.sangriaTotal, 0);
  const supply = ledgers.reduce((sum, ledger) => sum + ledger.supplyTotal, 0);
  const closed = ledgers.filter((ledger) => ledger.difference != null);
  const expected = ledgers.reduce((sum, ledger) => sum + ledger.expectedCash, 0);
  const counted = closed.reduce((sum, ledger) => sum + (ledger.countedCash ?? 0), 0);
  const difference = closed.reduce((sum, ledger) => sum + (ledger.difference ?? 0), 0);

  const envios = transfers.filter(
      (transfer) =>
        transferKind(transfer) === "envio" &&
        (scope === "all" || scope === "factory" || transfer.toLocationId === scope),
  );
  let sentQty = 0;
  let arrivedQty = 0;
  let transitQty = 0;
  for (const transfer of envios) {
    const status = transferStatus(transfer);
    for (const part of transferItems.filter((item) => item.transferId === transfer.id)) {
      sentQty += part.qty;
      if (status === "em_transito") {
        transitQty += part.qty;
        continue;
      }
      arrivedQty += receivedQtyOf(part, status) ?? part.qty;
    }
  }
  const gap = sentQty - arrivedQty - transitQty;

  const inventories = counts
    .filter((row) => row.at >= window.from && row.at <= window.to)
    .filter((row) => scope === "all" || row.locationId === scope);
  let systemQty = 0;
  let physicalQty = 0;
  for (const count of inventories) {
    for (const line of lines.filter((item) => item.countId === count.id)) {
      systemQty += line.systemQty;
      physicalQty += line.countedQty;
    }
  }

  const rows: (string | number)[][] = [];

  if (ledgers.length === 0) {
    rows.push(["Caixa", "Movimento", "Sem caixa neste recorte"]);
  } else {
    rows.push(
      ["Caixa", "Vendas em espécie", money(dinheiro)],
      ["Caixa", "Pix", money(pix)],
      ["Caixa", "Cartão", money(cartao)],
      ["Caixa", "Sangria", money(sangria)],
      ["Caixa", "Suprimento", money(supply)],
      ["Caixa", "Esperado em espécie", money(expected)],
      ["Caixa", "Dinheiro apurado", closed.length ? money(counted) : "Ainda sem conferência"],
      [
        "Caixa",
        "Quebra ou sobra",
        closed.length ? `${cashDifferenceLabel(difference)} · ${money(difference)}` : "—",
      ],
    );
  }

  if (envios.length === 0) {
    rows.push(["Envio", "Fábrica → loja", "Nenhum envio"]);
  } else {
    rows.push(
      ["Envio", "Fábrica mandou", `${sentQty} un.`],
      ["Envio", "Loja confirmou", `${arrivedQty} un.`],
      ["Envio", "Ainda em trânsito", `${transitQty} un.`],
      [
        "Envio",
        "Divergência",
        gap === 0 ? "Bateu" : gap > 0 ? `Faltou ${gap} un. · voltou à fábrica` : `Sobra ${Math.abs(gap)} un.`,
      ],
    );
  }

  rows.push(["Saídas", "Vendeu", `${soldQty} un. · ${money(soldRev)}`]);
  if ((scope === "all" || scope === "factory") && clienteQty > 0) {
    rows.push(["Saídas", "Cliente", `${clienteQty} un.`]);
  }
  rows.push(
    ["Saídas", "Sobra", `${leftoverQty} un.`],
    ["Saídas", "Vencido", `${expiredQty} un.`],
    ["Saídas", "Consumo interno", `${consumeQty} un.`],
    ["Saídas", "Abriu pacote", `${packQty} pacote${packQty === 1 ? "" : "s"}`],
  );

  if (inventories.length === 0) {
    rows.push(["Inventário", "Contagem", "Não teve inventário neste recorte"]);
  } else {
    rows.push(
      ["Inventário", "Contagens", String(inventories.length)],
      ["Inventário", "Sistema", `${systemQty} un.`],
      ["Inventário", "Físico", `${physicalQty} un.`],
      [
        "Inventário",
        "Diferença",
        `${physicalQty - systemQty} un. · ${physicalQty - systemQty === 0 ? "bateu" : physicalQty > systemQty ? "apareceu a mais" : "faltou no físico"}`,
      ],
    );
  }

  return {
    title: "Pacote do dia",
    subtitle: `${window.label} · ${scopeName(scope)}`,
    headers: ["Bloco", "O que olhar", "Número"],
    rows,
    notes: [
      "Uma folha para o dono. Não substitui o detalhe de cada relatório.",
      "Espécie no caixa é só a parte em dinheiro. Pix e cartão não entram na gaveta.",
      "Mandou é o que saiu da câmara. Confirmou é o que a loja conferiu. O que faltou volta para a fábrica. Em trânsito ainda não é estoque da loja.",
      "Sobra não é vencido. Inventário não é venda.",
      "Cliente da câmara só aparece na folha da fábrica ou da rede. A loja não conta essas unidades.",
      closed.length < ledgers.length ? "Tem caixa ainda aberto neste recorte: o apurado fica em branco até encerrar." : "",
    ].filter(Boolean),
  };
}

export function fileName(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
}
