import Dexie, { type Table } from "dexie";
import type {
  AppNotification,
  AppSetting,
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
  StockRequest,
  StockRequestItem,
  StockRow,
  StoreRecord,
  Transfer,
  TransferItem,
  Waste,
} from "./types";

const baseStores = {
  products: "id, name, category",
  niches: "id, productId, active",
  lots: "id, nicheId, madeAt, expiresAt",
  stock: "id, locationId, nicheId, [locationId+nicheId]",
  movements: "id, locationId, nicheId, at, refId, type",
  transfers: "id, fromLocationId, toLocationId, at",
  transferItems: "id, transferId, nicheId",
  sales: "id, locationId, at, cashSessionId",
  saleItems: "id, saleId, nicheId",
  wastes: "id, locationId, at, nicheId",
};

class AppDB extends Dexie {
  products!: Table<Product, string>;
  niches!: Table<Niche, string>;
  lots!: Table<Lot, string>;
  stock!: Table<StockRow, string>;
  movements!: Table<Movement, string>;
  transfers!: Table<Transfer, string>;
  transferItems!: Table<TransferItem, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  wastes!: Table<Waste, string>;
  requests!: Table<StockRequest, string>;
  requestItems!: Table<StockRequestItem, string>;
  notifications!: Table<AppNotification, string>;
  stores!: Table<StoreRecord, string>;
  employees!: Table<Employee, string>;
  cashSessions!: Table<CashSession, string>;
  internalAllowances!: Table<InternalAllowance, string>;
  settings!: Table<AppSetting, string>;
  consumptions!: Table<InternalConsumption, string>;
  consumeUsers!: Table<ConsumeUser, string>;
  cashMovements!: Table<CashMovement, string>;

  constructor() {
    super("gp-salgados");
    this.version(1).stores({
      products: "id, name, category",
      niches: "id, productId, active",
      lots: "id, nicheId, madeAt",
      stock: "id, locationId, nicheId, [locationId+nicheId]",
      movements: "id, locationId, nicheId, at, refId",
      transfers: "id, fromLocationId, toLocationId, at",
      transferItems: "id, transferId, nicheId",
      sales: "id, locationId, at",
      saleItems: "id, saleId, nicheId",
      wastes: "id, locationId, at, nicheId",
    });
    this.version(2)
      .stores({
        products: "id, name, category",
        niches: "id, productId, active",
        lots: "id, nicheId, madeAt",
        stock: "id, locationId, nicheId, [locationId+nicheId]",
        movements: "id, locationId, nicheId, at, refId",
        transfers: "id, fromLocationId, toLocationId, at",
        transferItems: "id, transferId, nicheId",
        sales: "id, locationId, at",
        saleItems: "id, saleId, nicheId",
        wastes: "id, locationId, at, nicheId",
      })
      .upgrade((tx) =>
        tx
          .table("niches")
          .toCollection()
          .modify((niche: { minStock?: number; minStockFactory?: number; minStockStore?: number }) => {
            const storeMin = niche.minStockStore ?? niche.minStock ?? 20;
            niche.minStockStore = storeMin;
            niche.minStockFactory = niche.minStockFactory ?? Math.max(100, storeMin * 5);
          }),
      );
    this.version(3).stores({
      products: "id, name, category",
      niches: "id, productId, active",
      lots: "id, nicheId, madeAt",
      stock: "id, locationId, nicheId, [locationId+nicheId]",
      movements: "id, locationId, nicheId, at, refId",
      transfers: "id, fromLocationId, toLocationId, at",
      transferItems: "id, transferId, nicheId",
      sales: "id, locationId, at",
      saleItems: "id, saleId, nicheId",
      wastes: "id, locationId, at, nicheId",
      requests: "id, fromLocationId, status, at",
      requestItems: "id, requestId, nicheId",
      notifications: "id, audience, at, type",
    });
    this.version(4)
      .stores({
        ...baseStores,
        requests: "id, fromLocationId, status, at",
        requestItems: "id, requestId, nicheId",
        notifications: "id, audience, at, type",
        stores: "id, name, active",
        employees: "id, storeId, active, name",
        cashSessions: "id, locationId, period, openedAt, closedAt",
        internalAllowances: "id, nicheId, enabled",
        settings: "id",
        consumptions: "id, locationId, nicheId, at, dayKey",
      })
      .upgrade(async (tx) => {
        await tx
          .table("products")
          .toCollection()
          .modify((product: { category?: string; perishable?: boolean; shelfLifeDays?: number }) => {
            const perishable = product.perishable ?? product.category === "salgado";
            product.perishable = perishable;
            product.shelfLifeDays = product.shelfLifeDays ?? (perishable ? 2 : 0);
          });
        await tx
          .table("niches")
          .toCollection()
          .modify((niche: { promoAllowed?: boolean; promoPrice?: number }) => {
            niche.promoAllowed = niche.promoAllowed ?? false;
            niche.promoPrice = niche.promoPrice ?? 0;
          });
      });
    this.version(5)
      .stores({
        ...baseStores,
        requests: "id, fromLocationId, status, at",
        requestItems: "id, requestId, nicheId",
        notifications: "id, audience, at, type",
        stores: "id, name, active",
        employees: "id, storeId, active, name",
        cashSessions: "id, locationId, period, openedAt, closedAt",
        internalAllowances: "id, nicheId, enabled",
        settings: "id",
        consumptions: "id, locationId, nicheId, at, dayKey",
        consumeUsers: "id, login, locationId, active",
      })
      .upgrade(async (tx) => {
        await tx
          .table("stores")
          .toCollection()
          .modify((store: { address?: string; phone?: string; name?: string }) => {
            store.address = store.address ?? "";
            store.phone = store.phone ?? "";
          });
      });
    this.version(6).stores({
      ...baseStores,
      requests: "id, fromLocationId, status, at",
      requestItems: "id, requestId, nicheId",
      notifications: "id, audience, at, type",
      stores: "id, name, active",
      employees: "id, storeId, active, name",
      cashSessions: "id, locationId, period, openedAt, closedAt",
      internalAllowances: "id, nicheId, enabled",
      settings: "id",
      consumptions: "id, locationId, nicheId, at, dayKey",
      consumeUsers: "id, login, locationId, active",
      cashMovements: "id, sessionId, locationId, type, at",
    });
  }
}

let db: AppDB | null = null;

export function getDb() {
  if (typeof window === "undefined") {
    throw new Error("O banco só funciona no navegador.");
  }
  if (!db) db = new AppDB();
  return db;
}
