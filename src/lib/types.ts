export type Category = "salgado" | "bebida" | "limpeza" | "descartavel" | "embalagem";
export type MovementType = "production" | "send" | "sale" | "sale_void" | "waste" | "internal" | "ajuste";
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
export type PaymentMethod = "dinheiro" | "pix" | "cartao";
export type SaleChannel = "caixa" | "delivery" | "encomenda";
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
};

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
};

export type Lot = {
  id: string;
  nicheId: string;
  madeAt: string;
  expiresAt?: string;
  unitCost?: number;
};

export function lotCost(lot?: Pick<Lot, "unitCost"> | null, nicheCost = 0) {
  return lot?.unitCost ?? nicheCost;
}

export type StockRow = {
  id: string;
  locationId: string;
  nicheId: string;
  lotId: string;
  qty: number;
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
};

export type Transfer = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  at: string;
};

export type TransferItem = {
  id: string;
  transferId: string;
  nicheId: string;
  lotId: string;
  qty: number;
};

export type Sale = {
  id: string;
  locationId: string;
  channel: SaleChannel;
  payment: PaymentMethod;
  total: number;
  at: string;
  cashSessionId?: string;
  voidedAt?: string;
  voidReason?: SaleVoidReason;
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
};

export type RequestStatus = "pending" | "sent" | "cancelled";
export type NotificationAudience = "admin" | "factory";
export type NotificationType = "store_request" | "request_sent" | "request_cancelled";

export type StockRequest = {
  id: string;
  fromLocationId: string;
  status: RequestStatus;
  note: string;
  at: string;
  resolvedAt?: string;
};

export type StockRequestItem = {
  id: string;
  requestId: string;
  nicheId: string;
  qty: number;
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
  reason: "sobra_frito" | "vencido" | "outro";
  at: string;
  unitCost?: number;
  unitPrice?: number;
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
  active: boolean;
};

export type CashMovementKind = "sangria" | "suprimento";

export type CashMovement = {
  id: string;
  sessionId: string;
  locationId: string;
  type: CashMovementKind;
  amount: number;
  reason: string;
  at: string;
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
};

export type InternalAllowance = {
  id: string;
  nicheId: string;
  enabled: boolean;
  dailyLimit: number;
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
};

export type InventoryCount = {
  id: string;
  locationId: string;
  at: string;
  countedBy: string;
};

export type InventoryLine = {
  id: string;
  countId: string;
  nicheId: string;
  lotId?: string;
  systemQty: number;
  countedQty: number;
  reason: AdjustmentReason;
};
