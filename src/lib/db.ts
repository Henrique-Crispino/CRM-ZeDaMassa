import Dexie, { type Table } from "dexie";
import type {
  AppNotification,
  Lot,
  Movement,
  Niche,
  Product,
  Sale,
  SaleItem,
  StockRequest,
  StockRequestItem,
  StockRow,
  Transfer,
  TransferItem,
  Waste,
} from "./types";

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

  constructor() {
    super("gp-salgados");
    const stores = {
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
    };
    this.version(1).stores(stores);
    this.version(2)
      .stores(stores)
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
      ...stores,
      requests: "id, fromLocationId, status, at",
      requestItems: "id, requestId, nicheId",
      notifications: "id, audience, at, type",
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
