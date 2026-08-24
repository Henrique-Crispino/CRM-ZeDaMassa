import { money2 } from "./cash";
import { isSoldAtRegister } from "./categories";
import { getDb } from "./db";
import { catalogItems } from "./queries";
import { newId } from "./money";
import type { Combo } from "./types";
import { closedCatalogMessage, comboIsLive, comboStatus, productIsLive } from "./types";

export class ComboError extends Error {}

export function splitComboPrice(
  price: number,
  parts: { nicheId: string; qty: number; sellPrice: number }[],
) {
  const weights = parts.map((part) => Math.max(0, part.qty) * Math.max(0, part.sellPrice));
  const weightSum = weights.reduce((sum, n) => sum + n, 0);
  const lines = parts.map((part, index) => {
    const share = weightSum > 0 ? money2((price * weights[index]) / weightSum) : 0;
    return {
      nicheId: part.nicheId,
      qty: part.qty,
      lineTotal: share,
      unitPrice: part.qty > 0 ? money2(share / part.qty) : 0,
    };
  });
  const drift = money2(price - lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const last = lines[lines.length - 1];
  if (last && drift !== 0) {
    last.lineTotal = money2(last.lineTotal + drift);
    last.unitPrice = last.qty > 0 ? money2(last.lineTotal / last.qty) : last.unitPrice;
  }
  return lines;
}

export function comboPacksAvailable(
  items: { nicheId: string; qty: number }[],
  sellable: Record<string, number>,
) {
  if (items.length === 0) return 0;
  return Math.min(
    ...items.map((item) => (item.qty > 0 ? Math.floor((sellable[item.nicheId] ?? 0) / item.qty) : 0)),
  );
}

export function comboMissingLabel(
  items: { nicheId: string; qty: number; label: string }[],
  sellable: Record<string, number>,
) {
  const missing = items.find((item) => item.qty > 0 && (sellable[item.nicheId] ?? 0) < item.qty);
  return missing?.label;
}

export async function listComboItems(comboId: string) {
  const rows = await getDb().comboItems.where("comboId").equals(comboId).toArray();
  return rows.filter((row) => row.qty > 0).sort((a, b) => a.nicheId.localeCompare(b.nicheId));
}

export async function listCombos() {
  const [combos, allItems, catalog] = await Promise.all([
    getDb().combos.toArray(),
    getDb().comboItems.toArray(),
    catalogItems(false),
  ]);
  const labels = new Map(catalog.map((item) => [item.niche.id, item.label]));
  return combos
    .map((combo) => {
      const items = allItems
        .filter((row) => row.comboId === combo.id && row.qty > 0)
        .map((row) => ({
          ...row,
          label: labels.get(row.nicheId) ?? row.nicheId,
        }));
      return { ...combo, items, status: comboStatus(combo) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function listLiveCombos() {
  const rows = await listCombos();
  return rows.filter((row) => comboIsLive(row) && row.items.length >= 2);
}

export async function saveCombo(input: {
  id?: string;
  name: string;
  price: number;
  enabled: boolean;
  promoFrom?: string;
  promoTo?: string;
  items: { nicheId: string; qty: number }[];
}) {
  const name = input.name.trim();
  const price = money2(input.price);
  const items = input.items.filter((item) => item.qty > 0);
  if (!name) throw new ComboError("Dê um nome para o combo. Ex.: 10 mini + Coca.");
  if (!(price > 0)) throw new ComboError("Informe o preço do combo.");
  if (items.length < 2) throw new ComboError("Um combo precisa de pelo menos dois produtos.");

  const db = getDb();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));
  for (const [index, product] of products.entries()) {
    if (!product || !niches[index]) throw new ComboError("Produto do combo não encontrado.");
    if (!productIsLive(product)) throw new ComboError(closedCatalogMessage(product.name));
    if (!isSoldAtRegister(product.category)) {
      throw new ComboError(`${product.name} não vende no caixa. Combo só com salgado e bebida.`);
    }
  }

  if (input.enabled) {
    if (!input.promoFrom || !input.promoTo) {
      throw new ComboError("Combo precisa de início e fim. Sem isso ele fica ligado para sempre.");
    }
    if (new Date(input.promoFrom) >= new Date(input.promoTo)) {
      throw new ComboError("O fim tem que ser depois do início.");
    }
  }

  const id = input.id?.trim() || newId();
  await db.transaction("rw", [db.combos, db.comboItems], async () => {
    await db.combos.put({
      id,
      name,
      price,
      enabled: input.enabled,
      promoFrom: input.promoFrom ?? "",
      promoTo: input.promoTo ?? "",
    });
    const previous = await db.comboItems.where("comboId").equals(id).toArray();
    if (previous.length) await db.comboItems.bulkDelete(previous.map((row) => row.id));
    await db.comboItems.bulkAdd(
      items.map((item) => ({
        id: newId(),
        comboId: id,
        nicheId: item.nicheId,
        qty: Math.floor(item.qty),
      })),
    );
  });
  return id;
}

export async function removeCombo(id: string) {
  const db = getDb();
  await db.transaction("rw", [db.combos, db.comboItems], async () => {
    const rows = await db.comboItems.where("comboId").equals(id).toArray();
    if (rows.length) await db.comboItems.bulkDelete(rows.map((row) => row.id));
    await db.combos.delete(id);
  });
}

export async function loadComboForCheckout(comboId: string) {
  const db = getDb();
  const combo = await db.combos.get(comboId);
  if (!combo) throw new ComboError("Combo não encontrado.");
  const status = comboStatus(combo);
  if (!comboIsLive(combo)) {
    throw new ComboError(
      status === "ended"
        ? `O combo ${combo.name} já acabou.`
        : status === "scheduled"
          ? `O combo ${combo.name} ainda não começou.`
          : `O combo ${combo.name} não está liberado.`,
    );
  }
  const items = await listComboItems(comboId);
  if (items.length < 2) throw new ComboError(`O combo ${combo.name} está incompleto.`);
  return { combo, items };
}
