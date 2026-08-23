export type Category = "salgado" | "bebida";
export type MovementType = "production" | "send" | "sale" | "waste";
export type PaymentMethod = "dinheiro" | "pix" | "cartao";
export type SaleChannel = "caixa" | "delivery" | "encomenda";

export type Product = {
  id: string;
  name: string;
  category: Category;
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
};

export type Lot = {
  id: string;
  nicheId: string;
  madeAt: string;
};

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
};

export type SaleItem = {
  id: string;
  saleId: string;
  nicheId: string;
  lotId: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
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
  reason: "sobra_frito" | "outro";
  at: string;
  unitCost?: number;
  unitPrice?: number;
};
