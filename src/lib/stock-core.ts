import { getDb } from "./db";
import { todayDate } from "./money";

export class StockError extends Error {}

export function fifoLotOrder(
  a: { madeAt: string; expiresAt?: string },
  b: { madeAt: string; expiresAt?: string },
) {
  return (
    (a.expiresAt ?? "9999-12-31").localeCompare(b.expiresAt ?? "9999-12-31") || a.madeAt.localeCompare(b.madeAt)
  );
}

export function stockKey(locationId: string, nicheId: string, lotId: string, allocatedToRequestId?: string) {
  const base = `${locationId}:${nicheId}:${lotId}`;
  return allocatedToRequestId ? `${base}@${allocatedToRequestId}` : base;
}

export type OldestLotsOptions = {
  skipExpired?: boolean;
  expiredMessage?: string;
  /** Balcão, sobra, devolução — ignora saldo reservado à festa. */
  onlyFree?: boolean;
  /** Entrega da festa — só o reservado deste pedido. */
  onlyRequestId?: string;
};

export async function changeStock(
  locationId: string,
  nicheId: string,
  lotId: string,
  qty: number,
  allocatedToRequestId?: string,
) {
  const db = getDb();
  const id = stockKey(locationId, nicheId, lotId, allocatedToRequestId);
  const current = await db.stock.get(id);
  if (!Number.isFinite(qty)) {
    throw new StockError("A quantidade do movimento não é um número.");
  }
  const next = (current?.qty ?? 0) + qty;
  if (!Number.isFinite(next) || next < 0) {
    throw new StockError("Não tem quantidade suficiente no estoque.");
  }
  if (next === 0) {
    if (current) await db.stock.delete(id);
    return;
  }
  await db.stock.put({
    id,
    locationId,
    nicheId,
    lotId,
    qty: next,
    ...(allocatedToRequestId ? { allocatedToRequestId } : {}),
  });
}

export async function oldestLots(
  locationId: string,
  nicheId: string,
  qty: number,
  options?: OldestLotsOptions,
) {
  const db = getDb();
  const today = todayDate();
  const rows = (await db.stock.where("[locationId+nicheId]").equals([locationId, nicheId]).toArray())
    .filter((row) => row.qty > 0)
    .filter((row) => {
      if (options?.onlyRequestId) return row.allocatedToRequestId === options.onlyRequestId;
      if (options?.onlyFree) return !row.allocatedToRequestId;
      return true;
    });

  const lots = await db.lots.bulkGet(rows.map((row) => row.lotId));
  const ordered = rows
    .map((row, index) => ({
      row,
      madeAt: lots[index]?.madeAt ?? "9999-12-31",
      expiresAt: lots[index]?.expiresAt,
    }))
    .filter((item) => {
      if (!options?.skipExpired || !item.expiresAt) return true;
      return item.expiresAt >= today;
    })
    .sort(fifoLotOrder);

  let missing = qty;
  const taken: { lotId: string; qty: number; allocatedToRequestId?: string }[] = [];
  for (const item of ordered) {
    if (missing <= 0) break;
    const use = Math.min(item.row.qty, missing);
    taken.push({
      lotId: item.row.lotId,
      qty: use,
      allocatedToRequestId: item.row.allocatedToRequestId,
    });
    missing -= use;
  }

  if (missing > 0) {
    const expiredQty = rows
      .filter((row) => {
        const lot = lots.find((item) => item?.id === row.lotId);
        return Boolean(lot?.expiresAt && lot.expiresAt < today);
      })
      .reduce((sum, row) => sum + row.qty, 0);
    if (options?.skipExpired && expiredQty > 0) {
      throw new StockError(
        options.expiredMessage ??
          "Não dá para usar lote vencido. Descarte no estoque. O que ainda vale não chega para esta quantidade.",
      );
    }
    throw new StockError("Não tem quantidade suficiente no estoque.");
  }
  return taken;
}

export async function stockQty(locationId: string, nicheId: string) {
  const rows = await getDb()
    .stock.where("[locationId+nicheId]")
    .equals([locationId, nicheId])
    .toArray();
  return rows.reduce((sum, row) => sum + row.qty, 0);
}
