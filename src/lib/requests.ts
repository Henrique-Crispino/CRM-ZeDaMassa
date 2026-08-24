import { getDb } from "./db";
import { getLocation, isStore } from "./locations";
import { formatTime, newId } from "./money";
import { catalogItems, stockByLocation } from "./queries";
import { sendToStore, StockError } from "./stock";
import type { AppNotification, NotificationAudience, StockRequest } from "./types";

export class RequestError extends Error {}

export type RequestView = StockRequest & {
  storeName: string;
  items: { nicheId: string; label: string; qty: number; factoryQty: number }[];
};

async function notify(input: {
  type: AppNotification["type"];
  title: string;
  body: string;
  refId: string;
}) {
  const db = getDb();
  const at = new Date().toISOString();
  await db.notifications.bulkAdd(
    (["admin", "factory"] as NotificationAudience[]).map((audience) => ({
      id: newId(),
      audience,
      type: input.type,
      title: input.title,
      body: input.body,
      refId: input.refId,
      at,
    })),
  );
}

export async function createStoreRequest(input: {
  fromLocationId: string;
  note?: string;
  items: { nicheId: string; qty: number }[];
}) {
  if (!isStore(input.fromLocationId)) {
    throw new RequestError("Só a loja pede produto para a fábrica.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new RequestError("Escolha pelo menos um produto e a quantidade.");
  }

  const db = getDb();
  const requestId = newId();
  const at = new Date().toISOString();
  const storeName = getLocation(input.fromLocationId)?.name ?? "loja";
  const catalog = await catalogItems(false);
  const labels = items
    .map((item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return found ? `${item.qty} ${found.label}` : `${item.qty}`;
    })
    .slice(0, 4)
    .join(", ");

  await db.transaction("rw", [db.requests, db.requestItems, db.notifications], async () => {
    await db.requests.add({
      id: requestId,
      fromLocationId: input.fromLocationId,
      status: "pending",
      note: input.note?.trim() ?? "",
      at,
    });
    for (const item of items) {
      await db.requestItems.add({
        id: newId(),
        requestId,
        nicheId: item.nicheId,
        qty: item.qty,
      });
    }
    await notify({
      type: "store_request",
      title: `${storeName} pediu produto`,
      body: labels,
      refId: requestId,
    });
  });

  return requestId;
}

export async function listRequests(status?: StockRequest["status"]): Promise<RequestView[]> {
  const db = getDb();
  const [requests, items, catalog, stock] = await Promise.all([
    db.requests.orderBy("at").reverse().toArray(),
    db.requestItems.toArray(),
    catalogItems(false),
    stockByLocation(),
  ]);

  const factoryQty = new Map(stock.map((row) => [row.niche.id, row.qty.factory ?? 0]));

  return requests
    .filter((request) => (status ? request.status === status : true))
    .map((request) => ({
      ...request,
      storeName: getLocation(request.fromLocationId)?.name ?? "Loja",
      items: items
        .filter((item) => item.requestId === request.id)
        .map((item) => {
          const found = catalog.find((row) => row.niche.id === item.nicheId);
          return {
            nicheId: item.nicheId,
            label: found?.label ?? "Produto",
            qty: item.qty,
            factoryQty: factoryQty.get(item.nicheId) ?? 0,
          };
        }),
    }));
}

export async function fulfillRequest(requestId: string, qtyByNiche?: Record<string, number>) {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || request.status !== "pending") {
    throw new RequestError("Esse pedido já foi resolvido.");
  }

  const items = await db.requestItems.where("requestId").equals(requestId).toArray();
  const payload = items
    .map((item) => ({
      nicheId: item.nicheId,
      qty: qtyByNiche?.[item.nicheId] ?? item.qty,
    }))
    .filter((item) => item.qty > 0);

  if (payload.length === 0) {
    throw new RequestError("Informe o que vai mandar.");
  }

  try {
    await sendToStore({ toLocationId: request.fromLocationId, items: payload });
  } catch (error) {
    if (error instanceof StockError) throw error;
    throw error;
  }

  const at = new Date().toISOString();
  const storeName = getLocation(request.fromLocationId)?.name ?? "loja";
  await db.requests.update(requestId, { status: "sent", resolvedAt: at });
  await notify({
    type: "request_sent",
    title: `Pedido da ${storeName} foi enviado`,
    body: "A fábrica já mandou o que deu para mandar.",
    refId: requestId,
  });
}

export async function cancelRequest(requestId: string) {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || request.status !== "pending") {
    throw new RequestError("Esse pedido já foi resolvido.");
  }
  const storeName = getLocation(request.fromLocationId)?.name ?? "loja";
  await db.requests.update(requestId, { status: "cancelled", resolvedAt: new Date().toISOString() });
  await notify({
    type: "request_cancelled",
    title: `Pedido da ${storeName} foi dispensado`,
    body: "A fábrica não vai mandar este pedido.",
    refId: requestId,
  });
}

export async function unreadNotifications(audience: NotificationAudience) {
  const rows = await getDb().notifications.where("audience").equals(audience).toArray();
  return rows.filter((row) => !row.readAt).sort((a, b) => b.at.localeCompare(a.at));
}

export async function allNotifications(audience: NotificationAudience) {
  const rows = await getDb().notifications.where("audience").equals(audience).toArray();
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function markNotificationsRead(audience: NotificationAudience) {
  const unread = await unreadNotifications(audience);
  const now = new Date().toISOString();
  await Promise.all(unread.map((row) => getDb().notifications.update(row.id, { readAt: now })));
}

export function requestWhen(iso: string) {
  return `${new Date(iso).toLocaleDateString("pt-BR")} às ${formatTime(iso)}`;
}
