export type Category = "salgado" | "bebida" | "limpeza" | "descartavel" | "embalagem" | "insumo";
export type MovementType =
  | "production"
  | "send"
  | "sale"
  | "sale_void"
  | "waste"
  | "internal"
  | "ajuste"
  | "purchase"
  | "return"
  | "uso"
  | "cliente"
  | "retirada";
export type AdjustmentReason = "quebra" | "furto" | "erro" | "contagem";

export const ADJUSTMENT_REASONS: { id: AdjustmentReason; label: string }[] = [
  { id: "quebra", label: "Quebra" },
  { id: "furto", label: "Furto" },
  { id: "erro", label: "Erro de lançamento" },
  { id: "contagem", label: "Contagem" },
];

export function adjustmentReasonLabel(reason?: AdjustmentReason) {
  return ADJUSTMENT_REASONS.find((item) => item.id === reason)?.label ?? "Ajuste";
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  production: "Produção",
  purchase: "Compra",
  send: "Envio",
  return: "Devolução",
  sale: "Venda",
  sale_void: "Estorno",
  waste: "Perda",
  internal: "Consumo interno",
  ajuste: "Ajuste",
  uso: "Abriu o pacote",
  cliente: "Cliente",
  retirada: "Retirada",
};

export function movementLabel(type: MovementType) {
  return MOVEMENT_LABELS[type] ?? type;
}
export type PaymentMethod = "dinheiro" | "pix" | "cartao";
export type SaleChannel = "caixa" | "delivery" | "encomenda";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "cartao", label: "Cartão" },
];

export function paymentMethodLabel(method?: PaymentMethod | string) {
  return PAYMENT_METHODS.find((item) => item.id === method)?.label ?? method ?? "Pagamento";
}

export type SalePayment = {
  method: PaymentMethod;
  amount: number;
};

export function salePayments(sale: Pick<Sale, "payment" | "total" | "payments">): SalePayment[] {
  if (sale.payments?.length) {
    return sale.payments
      .filter((row) => row.amount > 0)
      .map((row) => ({ method: row.method, amount: row.amount }));
  }
  return sale.payment ? [{ method: sale.payment, amount: sale.total }] : [];
}

export function salePaymentShare(sale: Pick<Sale, "payment" | "total" | "payments">, method: PaymentMethod) {
  return salePayments(sale)
    .filter((row) => row.method === method)
    .reduce((sum, row) => sum + row.amount, 0);
}

export function salePaymentSummary(sale: Pick<Sale, "payment" | "total" | "payments">) {
  const rows = salePayments(sale);
  if (rows.length <= 1) return paymentMethodLabel(rows[0]?.method ?? sale.payment);
  return rows.map((row) => paymentMethodLabel(row.method)).join(" + ");
}
export type CashPeriod = "manha" | "tarde";
export type SaleVoidReason = "quantidade" | "produto" | "desistencia";

export const SALE_VOID_REASONS: { id: SaleVoidReason; label: string }[] = [
  { id: "quantidade", label: "Erro de quantidade" },
  { id: "produto", label: "Produto errado" },
  { id: "desistencia", label: "Cliente desistiu" },
];

export function isLiveSale(sale: Pick<Sale, "voidedAt">) {
  return !sale.voidedAt;
}

export function isRevenueSale(sale: Pick<Sale, "voidedAt" | "kind">) {
  return isLiveSale(sale) && sale.kind !== "sinal";
}

export function saleVoidReasonLabel(reason?: SaleVoidReason) {
  return SALE_VOID_REASONS.find((item) => item.id === reason)?.label ?? "Estornada";
}

export type Product = {
  id: string;
  name: string;
  category: Category;
  perishable: boolean;
  shelfLifeDays: number;
  createdAt: string;
  active?: boolean;
};

export function productIsLive(product: Pick<Product, "active">) {
  return product.active !== false;
}

export function closedCatalogMessage(name: string) {
  return `${name}: produto fechado. Não entra na venda, na produção, no pedido nem no envio.`;
}

export type Niche = {
  id: string;
  productId: string;
  name: string;
  sellPrice: number;
  costPrice: number;
  minStock: number;
  minStockFactory: number;
  minStockStore: number;
  active: boolean;
  promoAllowed: boolean;
  promoPrice: number;
  promoFrom?: string;
  promoTo?: string;
  promoOnlyExpiringToday?: boolean;
};

export type PromoStatus = "off" | "scheduled" | "live" | "ended";

export function promoStatus(
  niche: Pick<Niche, "promoAllowed" | "promoPrice" | "promoFrom" | "promoTo">,
  at = new Date(),
): PromoStatus {
  if (!niche.promoAllowed || !(niche.promoPrice > 0)) return "off";
  const t = at.getTime();
  if (niche.promoFrom) {
    const from = new Date(niche.promoFrom).getTime();
    if (Number.isFinite(from) && t < from) return "scheduled";
  }
  if (niche.promoTo) {
    const to = new Date(niche.promoTo).getTime();
    if (Number.isFinite(to) && t > to) return "ended";
  }
  return "live";
}

export function promoIsLive(
  niche: Pick<Niche, "promoAllowed" | "promoPrice" | "promoFrom" | "promoTo">,
  at = new Date(),
) {
  return promoStatus(niche, at) === "live";
}

export function promoStatusLabel(status: PromoStatus) {
  return {
    off: "Desligada",
    scheduled: "Ainda não começou",
    live: "Valendo agora",
    ended: "Já acabou",
  }[status];
}

export type Combo = {
  id: string;
  name: string;
  price: number;
  enabled: boolean;
  promoFrom: string;
  promoTo: string;
};

export type ComboItem = {
  id: string;
  comboId: string;
  nicheId: string;
  qty: number;
};

export type CustomerKind = "festa" | "volume";

export const CUSTOMER_KINDS: { id: CustomerKind; label: string }[] = [
  { id: "festa", label: "Festa ou retirada" },
  { id: "volume", label: "Compra na fábrica" },
];

export type Customer = {
  id: string;
  name: string;
  phone: string;
  note: string;
  address: string;
  kind?: CustomerKind;
  usualWeekdays?: number[];
  active: boolean;
  createdAt: string;
};

export const WEEKDAYS: { id: number; short: string; label: string }[] = [
  { id: 1, short: "Seg", label: "segunda" },
  { id: 2, short: "Ter", label: "terça" },
  { id: 3, short: "Qua", label: "quarta" },
  { id: 4, short: "Qui", label: "quinta" },
  { id: 5, short: "Sex", label: "sexta" },
  { id: 6, short: "Sáb", label: "sábado" },
  { id: 0, short: "Dom", label: "domingo" },
];

export function weekdayLabel(id: number) {
  return WEEKDAYS.find((item) => item.id === id)?.label ?? "";
}

export function customerKind(row?: Pick<Customer, "kind"> | null): CustomerKind {
  return row?.kind === "volume" ? "volume" : "festa";
}

export function customerKindLabel(kind?: CustomerKind | null) {
  const id = kind === "volume" ? "volume" : "festa";
  return CUSTOMER_KINDS.find((item) => item.id === id)?.label ?? "Festa ou retirada";
}

export function comboAsPromo(combo: Pick<Combo, "enabled" | "price" | "promoFrom" | "promoTo">) {
  return {
    promoAllowed: combo.enabled,
    promoPrice: combo.price,
    promoFrom: combo.promoFrom,
    promoTo: combo.promoTo,
  };
}

export function comboStatus(combo: Pick<Combo, "enabled" | "price" | "promoFrom" | "promoTo">, at = new Date()) {
  return promoStatus(comboAsPromo(combo), at);
}

export function comboIsLive(combo: Pick<Combo, "enabled" | "price" | "promoFrom" | "promoTo">, at = new Date()) {
  return comboStatus(combo, at) === "live";
}

export type Lot = {
  id: string;
  nicheId: string;
  madeAt: string;
  expiresAt?: string;
  unitCost?: number;
  unitPrice?: number;
};

export function lotCost(lot?: Pick<Lot, "unitCost"> | null, nicheCost = 0) {
  return lot?.unitCost ?? nicheCost;
}

export function lotPrice(lot?: Pick<Lot, "unitPrice"> | null, nichePrice = 0) {
  return lot?.unitPrice ?? nichePrice;
}

export function movementCharge(
  row: { qty: number; unitPrice?: number; unitCost?: number },
  lot?: Pick<Lot, "unitPrice" | "unitCost"> | null,
  niche?: { sellPrice?: number; costPrice?: number } | null,
) {
  const qty = Math.abs(row.qty);
  const unitPrice = row.unitPrice ?? lotPrice(lot, niche?.sellPrice ?? 0);
  const unitCost = row.unitCost ?? lotCost(lot, niche?.costPrice ?? 0);
  return { qty, unitPrice, unitCost, revenue: qty * unitPrice, cost: qty * unitCost };
}

export type FifoPriceChunk = { qty: number; unitPrice: number };

export function saleLotPrice(
  lot: Pick<Lot, "unitPrice"> | null | undefined,
  nichePrice: number,
  promoPrice: number,
  usePromo: boolean,
) {
  return usePromo ? promoPrice : lotPrice(lot, nichePrice);
}

export function fifoSaleTotal(chunks: FifoPriceChunk[]) {
  return chunks.reduce((sum, chunk) => sum + chunk.qty * chunk.unitPrice, 0);
}

export function takeFifoChunks(lots: FifoPriceChunk[], qty: number): FifoPriceChunk[] {
  let left = qty;
  const taken: FifoPriceChunk[] = [];
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.qty, left);
    if (take > 0) taken.push({ qty: take, unitPrice: lot.unitPrice });
    left -= take;
  }
  return taken;
}

export function quoteFifoQty(
  lots: FifoPriceChunk[],
  qty: number,
  usePromo: boolean,
  promoPrice: number,
  fallbackPrice: number,
) {
  if (qty <= 0) return 0;
  if (usePromo) return qty * promoPrice;
  const taken = takeFifoChunks(lots, qty);
  const used = taken.reduce((sum, chunk) => sum + chunk.qty, 0);
  return fifoSaleTotal(taken) + Math.max(0, qty - used) * fallbackPrice;
}

export type StockRow = {
  id: string;
  locationId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  /** Festa conferida — saldo não entra no balcão até entregar ou estornar. */
  allocatedToRequestId?: string;
};

export type Movement = {
  id: string;
  locationId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  type: MovementType;
  refId: string;
  at: string;
  unitCost?: number;
  unitPrice?: number;
  payment?: PaymentMethod;
  actorId?: string;
};

export type TransferStatus = "em_transito" | "conferido" | "divergente";

export const TRANSFER_STATUSES: { id: TransferStatus; label: string }[] = [
  { id: "em_transito", label: "Em trânsito" },
  { id: "conferido", label: "Conferido" },
  { id: "divergente", label: "Divergente" },
];

export function transferStatus(transfer?: Pick<Transfer, "status"> | null): TransferStatus {
  return transfer?.status ?? "conferido";
}

export function transferStatusLabel(status?: TransferStatus) {
  return TRANSFER_STATUSES.find((item) => item.id === status)?.label ?? "Conferido";
}

export function receivedQtyOf(item: Pick<TransferItem, "qty" | "receivedQty">, status?: TransferStatus) {
  if (item.receivedQty != null) return item.receivedQty;
  return status === "em_transito" ? undefined : item.qty;
}

export type TransferKind = "envio" | "devolucao";
export type ReturnReason = "lote_errado" | "excedente" | "qualidade";

export const RETURN_REASONS: { id: ReturnReason; label: string }[] = [
  { id: "lote_errado", label: "Lote errado" },
  { id: "excedente", label: "Excedente" },
  { id: "qualidade", label: "Qualidade" },
];

export function transferKind(transfer?: Pick<Transfer, "kind"> | null): TransferKind {
  return transfer?.kind ?? "envio";
}

export function transferKindLabel(kind?: TransferKind) {
  return kind === "devolucao" ? "Devolução" : "Envio";
}

export function returnReasonLabel(reason?: ReturnReason) {
  return RETURN_REASONS.find((item) => item.id === reason)?.label ?? "Devolução";
}

export type Transfer = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  at: string;
  status?: TransferStatus;
  receivedAt?: string;
  receivedBy?: string;
  receivedById?: string;
  sentBy?: string;
  sentById?: string;
  kind?: TransferKind;
  reason?: ReturnReason;
  requestId?: string;
};

export type TransferItem = {
  id: string;
  transferId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  receivedQty?: number;
  discardedQty?: number;
};

export type SaleKind = "venda" | "sinal";

export type Sale = {
  id: string;
  locationId: string;
  channel: SaleChannel;
  payment: PaymentMethod;
  payments?: SalePayment[];
  total: number;
  at: string;
  cashSessionId?: string;
  voidedAt?: string;
  voidedById?: string;
  voidReason?: SaleVoidReason;
  kind?: SaleKind;
  requestId?: string;
  actorId?: string;
  signalCredit?: number;
};

export type SaleItem = {
  id: string;
  saleId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  promo?: boolean;
  comboId?: string;
  comboName?: string;
  comboPacks?: number;
};

export type RequestStatus = "pending" | "parcial" | "sem_saldo" | "sent" | "cancelled";

export function isOpenRequest(status: RequestStatus) {
  return status === "pending" || status === "parcial" || status === "sem_saldo";
}

export function requestStatusLabel(status: RequestStatus) {
  return {
    pending: "Aguardando",
    parcial: "Parcial",
    sem_saldo: "Sem saldo",
    sent: "Enviado",
    cancelled: "Dispensado",
  }[status];
}

export function factoryOrderStatusLabel(status: RequestStatus) {
  return {
    pending: "Aguardando",
    parcial: "Parcial",
    sem_saldo: "Falta estoque",
    sent: "Entregue",
    cancelled: "Dispensado",
  }[status];
}

export type NotificationAudience = "admin" | "factory";
export type NotificationType =
  | "store_request"
  | "request_sent"
  | "request_cancelled"
  | "factory_order"
  | "factory_order_cancelled"
  | "factory_order_delivered"
  | "portfolio_reminder";

export type StoreRequestKind = "reposicao" | "encomenda";

export function storeRequestKind(row?: Pick<StockRequest, "kind"> | null): StoreRequestKind {
  return row?.kind === "encomenda" ? "encomenda" : "reposicao";
}

export function storeRequestKindLabel(kind?: StoreRequestKind | null) {
  return kind === "encomenda" ? "Festa" : "Reposição";
}

/** Festa da loja só entra na fila da fábrica depois do sinal no caixa. */
export function encomendaFactoryReady(row?: Pick<StockRequest, "kind" | "signalSaleId"> | null) {
  if (storeRequestKind(row) !== "encomenda") return true;
  return Boolean(row?.signalSaleId);
}

export function isEncomendaAwaitingSignal(
  row?: Pick<StockRequest, "kind" | "signalSaleId" | "deliveredAt" | "status"> | null,
) {
  if (storeRequestKind(row) !== "encomenda") return false;
  if (row?.deliveredAt || row?.status === "cancelled") return false;
  return !row?.signalSaleId;
}

export type StockRequest = {
  id: string;
  fromLocationId: string;
  status: RequestStatus;
  note: string;
  at: string;
  resolvedAt?: string;
  kind?: StoreRequestKind;
  neededBy?: string;
  guestName?: string;
  estimatedTotal?: number;
  signalAmount?: number;
  signalSaleId?: string;
  remainderSaleId?: string;
  deliveredAt?: string;
  actorId?: string;
  cancelledById?: string;
};

export type StockRequestItem = {
  id: string;
  requestId: string;
  nicheId: string;
  qty: number;
  sentQty?: number;
};

export type FactoryOrder = {
  id: string;
  customerId: string;
  status: RequestStatus;
  note: string;
  at: string;
  resolvedAt?: string;
  actorId?: string;
  cancelledById?: string;
};

export type FactoryOrderItem = {
  id: string;
  orderId: string;
  nicheId: string;
  qty: number;
  sentQty?: number;
};

export type AppNotification = {
  id: string;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  refId: string;
  at: string;
  readAt?: string;
};

export type Waste = {
  id: string;
  locationId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  reason: "sobra_frito" | "vencido" | "outro" | "devolucao";
  at: string;
  unitCost?: number;
  unitPrice?: number;
  actorId?: string;
};

export type StoreRecord = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  active: boolean;
  createdAt: string;
};

export type Employee = {
  id: string;
  name: string;
  storeId: string;
  locationId?: string;
  podeCaixa?: boolean;
  podeConsumo?: boolean;
  login?: string;
  password?: string;
  active: boolean;
};

export type CashMovementKind = "sangria" | "suprimento";
export type CashDestination = "cofre" | "deposito";

export const CASH_DESTINATIONS: { id: CashDestination; label: string; hint: string }[] = [
  { id: "cofre", label: "Cofre", hint: "Fica na loja, fora da gaveta. No demo é só o rótulo." },
  { id: "deposito", label: "Depósito", hint: "Sai da loja para o banco." },
];

export function cashDestinationLabel(destination?: CashDestination) {
  return CASH_DESTINATIONS.find((item) => item.id === destination)?.label ?? "Sem destino";
}

export type CashMovement = {
  id: string;
  sessionId: string;
  locationId: string;
  type: CashMovementKind;
  amount: number;
  reason: string;
  at: string;
  destination?: CashDestination;
  actorId?: string;
};

export type CashSession = {
  id: string;
  locationId: string;
  period: CashPeriod;
  employeeId: string;
  employeeName: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  cashSales?: number;
  pixSales?: number;
  cardSales?: number;
  sangriaTotal?: number;
  supplyTotal?: number;
  note?: string;
  secondCount?: number;
  recountedBy?: string;
  recountedById?: string;
  reopenedAt?: string;
  reopenNote?: string;
  reopenCount?: number;
  actorId?: string;
  closedById?: string;
};

export type InternalAllowance = {
  id: string;
  nicheId: string;
  enabled: boolean;
  dailyLimit: number;
  personLimit?: number;
};

export type ConsumeGroup = {
  id: string;
  name: string;
  enabled: boolean;
  personLimit: number;
  nicheIds: string[];
};

export type AppSetting = {
  id: string;
  value: string;
};

export type ConsumeUser = {
  id: string;
  name: string;
  login: string;
  password: string;
  locationId: string;
  active: boolean;
};

export type InternalConsumption = {
  id: string;
  locationId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  at: string;
  dayKey: string;
  userId?: string;
  userName?: string;
  unitCost?: number;
  actorId?: string;
};

export type InventoryCount = {
  id: string;
  locationId: string;
  at: string;
  countedBy: string;
  recountedBy?: string;
  recountedById?: string;
  actorId?: string;
};

export type InventoryLine = {
  id: string;
  countId: string;
  nicheId: string;
  lotId?: string;
  systemQty: number;
  countedQty: number;
  reason: AdjustmentReason;
  secondCount?: number;
};

export const INVENTORY_RECOUNT_THRESHOLD = 5;

export function needsInventoryRecount(delta: number) {
  return Math.abs(delta) > INVENTORY_RECOUNT_THRESHOLD;
}
