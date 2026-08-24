import { getDb } from "./db";
import { allStoreRecords, isStore, refreshLocations } from "./locations";
import { newId } from "./money";
import type { StoreRecord } from "./types";

export class StoreError extends Error {}

function shortFrom(name: string) {
  const cleaned = name.trim();
  return cleaned.length <= 16 ? cleaned : `${cleaned.slice(0, 14)}…`;
}

export async function listStores(includeInactive = false) {
  const rows = allStoreRecords().length
    ? allStoreRecords()
    : await getDb().stores.toArray();
  return rows
    .filter((store) => includeInactive || store.active)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function saveStore(input: {
  id?: string;
  name: string;
  address?: string;
  phone?: string;
}) {
  const name = input.name.trim();
  if (!name) throw new StoreError("Escreva o nome da loja.");

  const db = getDb();
  const existing = await db.stores.toArray();
  const duplicate = existing.find(
    (store) => store.active && store.name.toLowerCase() === name.toLowerCase() && store.id !== input.id,
  );
  if (duplicate) throw new StoreError("Já existe uma loja com esse nome.");

  const now = new Date().toISOString();
  const current = input.id ? await db.stores.get(input.id) : undefined;
  const record: StoreRecord = {
    id: input.id ?? `store_${newId().slice(0, 8)}`,
    name,
    shortName: shortFrom(name),
    address: (input.address ?? current?.address ?? "").trim(),
    phone: (input.phone ?? current?.phone ?? "").trim(),
    active: true,
    createdAt: current?.createdAt ?? now,
  };

  await db.stores.put(record);
  await refreshLocations();
  return record;
}

export async function removeStore(id: string) {
  if (!isStore(id) && id !== "store_1" && id !== "store_2") {
    throw new StoreError("Essa loja não pode ser removida.");
  }
  const db = getDb();
  const store = await db.stores.get(id);
  if (!store) throw new StoreError("Loja não encontrada.");

  const active = (await db.stores.toArray()).filter((item) => item.active && item.id !== id);
  if (active.length === 0) {
    throw new StoreError("Deixe pelo menos uma loja ativa.");
  }

  const stock = await db.stock.where("locationId").equals(id).toArray();
  const leftover = stock.reduce((sum, row) => sum + row.qty, 0);
  if (leftover > 0) {
    throw new StoreError("Esvazie o estoque dessa loja antes de remover.");
  }

  await db.stores.update(id, { active: false });
  await refreshLocations();
}
