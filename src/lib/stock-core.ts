import { getDb } from "./db";
import { todayDate } from "./money";

export class StockError extends Error {}

export function stockKey(locationId: string, nicheId: string, lotId: string) {
  return `${locationId}:${nicheId}:${lotId}`;
}

export async function changeStock(
  locationId: string,
  nicheId: string,
  lotId: string,
  qty: number,
) {
  const db = getDb();
  const id = stockKey(locationId, nicheId, lotId);
  const current = await db.stock.get(id);
  const next = (current?.qty ?? 0) + qty;
  if (next < 0) {
    throw new StockError("Não tem quantidade suficiente no estoque.");
  }
  if (next === 0) {
    if (current) await db.stock.delete(id);
    return;
  }
  await db.stock.put({ id, locationId, nicheId, lotId, qty: next });
}

export async function oldestLots(
  locationId: string,
  nicheId: string,
  qty: number,
  options?: { skipExpired?: boolean; expiredMessage?: string },
) {
  const db = getDb();
  const today = todayDate();
  const rows = (await db.stock.where("[locationId+nicheId]").equals([locationId, nicheId]).toArray())
    .filter((row) => row.qty > 0);

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
    .sort(
      (a, b) =>
        (a.expiresAt ?? "9999-12-31").localeCompare(b.expiresAt ?? "9999-12-31") ||
        a.madeAt.localeCompare(b.madeAt),
    );

  let missing = qty;
  const taken: { lotId: string; qty: number }[] = [];
  for (const item of ordered) {
    if (missing <= 0) break;
    const use = Math.min(item.row.qty, missing);
    taken.push({ lotId: item.row.lotId, qty: use });
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
