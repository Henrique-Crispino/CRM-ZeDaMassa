import { getDb } from "./db";
import { addDays, newId, todayDate } from "./money";
import { WEEKDAYS, customerKind, weekdayLabel, type Customer, type CustomerKind } from "./types";

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
  usualWeekdays?: number[];
}) {
  const name = input.name.trim();
  if (!name) throw new CustomerError("Escreva o nome de quem encomenda. Ex.: Dona Márcia.");

  const db = getDb();
  const current = input.id ? await db.customers.get(input.id) : undefined;
  const kind = customerKind({ kind: input.kind ?? current?.kind });
  const weekdays = kind === "volume"
    ? [...new Set((input.usualWeekdays ?? current?.usualWeekdays ?? []).filter((day) => day >= 0 && day <= 6))]
    : [];
  const record: Customer = {
    id: input.id?.trim() || newId(),
    name,
    phone: (input.phone ?? current?.phone ?? "").trim(),
    note: (input.note ?? current?.note ?? "").trim(),
    address: (input.address ?? current?.address ?? "").trim(),
    kind,
    usualWeekdays: weekdays.length ? weekdays : undefined,
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

function dayKey(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dowOf(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

export async function ensurePortfolioAlerts() {
  const db = getDb();
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const todayDow = dowOf(today);
  const tomorrowDow = dowOf(tomorrow);
  const customers = (await db.customers.toArray()).filter(
    (row) => row.active && customerKind(row) === "volume" && (row.usualWeekdays?.length ?? 0) > 0,
  );
  if (customers.length === 0) return;

  const orders = await db.factoryOrders.toArray();
  const notes = await db.notifications.where("type").equals("portfolio_reminder").toArray();
  const existing = new Set(notes.map((row) => `${row.refId}:${row.audience}`));

  const pending: { customerId: string; name: string; when: "today" | "tomorrow"; day: string }[] = [];
  for (const customer of customers) {
    const days = customer.usualWeekdays ?? [];
    if (days.includes(tomorrowDow)) {
      pending.push({ customerId: customer.id, name: customer.name, when: "tomorrow", day: tomorrow });
    }
    if (days.includes(todayDow)) {
      const already = orders.some(
        (order) => order.customerId === customer.id && dayKey(order.at) === today && order.status !== "cancelled",
      );
      if (!already) {
        pending.push({ customerId: customer.id, name: customer.name, when: "today", day: today });
      }
    }
  }

  const rows = pending.flatMap((item) => {
    const refId = `${item.customerId}:${item.day}`;
    const weekday = weekdayLabel(dowOf(item.day));
    const title =
      item.when === "tomorrow"
        ? `Amanhã é ${weekday} · ${item.name} costuma pedir`
        : `Hoje é ${weekday} · ${item.name} costuma pedir`;
    const body =
      item.when === "tomorrow"
        ? "Aviso de véspera. Não inventa quantidade. Abra Separar pedido se a padaria ligar."
        : "Ainda não tem pedido deste cliente hoje.";
    const at = new Date().toISOString();
    return (["admin", "factory"] as const)
      .filter((audience) => !existing.has(`${refId}:${audience}`))
      .map((audience) => ({
        id: newId(),
        audience,
        type: "portfolio_reminder" as const,
        title,
        body,
        refId,
        at,
      }));
  });

  if (rows.length) await db.notifications.bulkAdd(rows);
}

export function usualWeekdaysLabel(days?: number[]) {
  if (!days?.length) return "";
  return WEEKDAYS.filter((day) => days.includes(day.id))
    .map((day) => day.short)
    .join(" · ");
}

export async function suggestUsualWeekdays(customerId: string) {
  const orders = (await getDb().factoryOrders.toArray()).filter(
    (row) => row.customerId === customerId && row.status !== "cancelled",
  );
  const seen = new Set<number>();
  for (const order of orders) {
    seen.add(dowOf(dayKey(order.at)));
  }
  return WEEKDAYS.map((day) => day.id).filter((id) => seen.has(id));
}
