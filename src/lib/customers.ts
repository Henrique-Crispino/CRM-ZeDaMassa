import { getDb } from "./db";
import { newId } from "./money";
import { customerKind, type Customer, type CustomerKind } from "./types";

export class CustomerError extends Error {}

export async function listCustomers(search = "", kind?: CustomerKind | "todos") {
  const q = search.trim().toLowerCase();
  const rows = (await getDb().customers.toArray()).filter((row) => row.active);
  const byKind =
    !kind || kind === "todos" ? rows : rows.filter((row) => customerKind(row) === kind);
  const filtered = q
    ? byKind.filter((row) =>
        [row.name, row.phone, row.note, row.address].some((field) => field.toLowerCase().includes(q)),
      )
    : byKind;
  return filtered.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function saveCustomer(input: {
  id?: string;
  name: string;
  phone?: string;
  note?: string;
  address?: string;
  kind?: CustomerKind;
}) {
  const name = input.name.trim();
  if (!name) throw new CustomerError("Escreva o nome de quem encomenda. Ex.: Dona Márcia.");

  const db = getDb();
  const current = input.id ? await db.customers.get(input.id) : undefined;
  const kind = customerKind({ kind: input.kind ?? current?.kind });
  const record: Customer = {
    id: input.id?.trim() || newId(),
    name,
    phone: (input.phone ?? current?.phone ?? "").trim(),
    note: (input.note ?? current?.note ?? "").trim(),
    address: (input.address ?? current?.address ?? "").trim(),
    kind,
    active: true,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
  await db.customers.put(record);
  return record.id;
}

export async function getCustomer(id: string) {
  const row = await getDb().customers.get(id);
  if (!row?.active) return undefined;
  return row;
}

export async function removeCustomer(id: string) {
  const db = getDb();
  const row = await db.customers.get(id);
  if (!row) throw new CustomerError("Cliente não encontrado.");
  await db.customers.update(id, { active: false });
}
