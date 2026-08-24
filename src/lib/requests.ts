import { getDb } from "./db";
import { getLocation, isStore } from "./locations";
import { formatTime, newId } from "./money";
import { catalogItems, sellableQty, stockByLocation } from "./queries";
import { sendToStore, StockError } from "./stock";
import type { AppNotification, NotificationAudience, RequestStatus, StockRequest } from "./types";
import { closedCatalogMessage, isOpenRequest, productIsLive, requestStatusLabel } from "./types";

export class RequestError extends Error {}

export type RequestItemView = {
  nicheId: string;
  label: string;
  qty: number;
  sentQty: number;
  remaining: number;
  factoryQty: number;
  availableQty: number;
};

export type RequestView = Omit<StockRequest, "status"> & {
  status: RequestStatus;
  statusLabel: string;
  storeName: string;
  items: RequestItemView[];
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

function coverageStatus(items: Pick<RequestItemView, "remaining" | "availableQty" | "sentQty">[]): RequestStatus {
  const open = items.filter((item) => item.remaining > 0);
  if (open.length === 0) return "sent";
  if (open.every((item) => item.availableQty <= 0)) return "sem_saldo";
  if (items.some((item) => item.sentQty > 0) || open.some((item) => item.availableQty < item.remaining)) {
    return "parcial";
  }
  return "pending";
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
  for (const item of items) {
    const found = catalog.find((row) => row.niche.id === item.nicheId);
    if (found && !productIsLive(found.product)) {
      throw new RequestError(closedCatalogMessage(found.product.name));
    }
  }
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
        sentQty: 0,
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

export async function listRequests(status?: RequestStatus | "open"): Promise<RequestView[]> {
  const db = getDb();
  const [requests, items, catalog, stock] = await Promise.all([
    db.requests.orderBy("at").reverse().toArray(),
    db.requestItems.toArray(),
    catalogItems(false),
    stockByLocation(),
  ]);

  const sellable = new Map(stock.map((row) => [row.niche.id, sellableQty(row, "factory")]));
  const pool = new Map(sellable);

  const views = requests.map((request) => {
    const lines: RequestItemView[] = items
      .filter((item) => item.requestId === request.id)
      .map((item) => {
        const found = catalog.find((row) => row.niche.id === item.nicheId);
        const sentQty = item.sentQty ?? 0;
        const remaining = Math.max(0, item.qty - sentQty);
        return {
          nicheId: item.nicheId,
          label: found?.label ?? "Produto",
          qty: item.qty,
          sentQty,
          remaining,
          factoryQty: sellable.get(item.nicheId) ?? 0,
          availableQty: remaining,
        };
      });
    return { request, lines };
  });

  const openViews = views
    .filter((view) => isOpenRequest(view.request.status))
    .sort((a, b) => a.request.at.localeCompare(b.request.at));

  for (const view of openViews) {
    for (const line of view.lines) {
      const left = pool.get(line.nicheId) ?? 0;
      line.availableQty = Math.min(line.remaining, left);
      pool.set(line.nicheId, left - line.availableQty);
    }
  }

  return views
    .filter(({ request }) => {
      if (!status) return true;
      if (status === "open" || status === "pending") return isOpenRequest(request.status);
      return request.status === status;
    })
    .map(({ request, lines }) => {
      const live = isOpenRequest(request.status) ? coverageStatus(lines) : request.status;
      return {
        ...request,
        status: live,
        statusLabel: requestStatusLabel(live),
        storeName: getLocation(request.fromLocationId)?.name ?? "Loja",
        items: lines,
      };
    });
}

export async function fulfillRequest(
  requestId: string,
  qtyByNiche?: Record<string, number>,
  sentBy?: string,
) {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || !isOpenRequest(request.status)) {
    throw new RequestError("Esse pedido já foi resolvido.");
  }

  const items = await db.requestItems.where("requestId").equals(requestId).toArray();
  const payload = items
    .map((item) => {
      const remaining = Math.max(0, item.qty - (item.sentQty ?? 0));
      const asked = qtyByNiche?.[item.nicheId] ?? remaining;
      return {
        item,
        qty: Math.min(remaining, Math.max(0, Math.floor(asked))),
      };
    })
    .filter((row) => row.qty > 0);

  if (payload.length === 0) {
    throw new RequestError("Informe o que vai mandar.");
  }

  let transferId = "";
  try {
    transferId = await sendToStore({
      toLocationId: request.fromLocationId,
      items: payload.map((row) => ({ nicheId: row.item.nicheId, qty: row.qty })),
      sentBy: sentBy?.trim() || "Fábrica",
    });
  } catch (error) {
    if (error instanceof StockError) throw error;
    throw error;
  }

  const at = new Date().toISOString();
  const storeName = getLocation(request.fromLocationId)?.name ?? "loja";

  await db.transaction("rw", [db.requests, db.requestItems, db.notifications], async () => {
    for (const row of payload) {
      await db.requestItems.update(row.item.id, {
        sentQty: (row.item.sentQty ?? 0) + row.qty,
      });
    }

    const updated = await db.requestItems.where("requestId").equals(requestId).toArray();
    const leftover = updated.some((item) => (item.sentQty ?? 0) < item.qty);
    await db.requests.update(requestId, {
      status: leftover ? "parcial" : "sent",
      resolvedAt: leftover ? undefined : at,
    });

    await notify({
      type: "request_sent",
      title: leftover ? `Pedido da ${storeName} saiu em parte` : `Pedido da ${storeName} foi enviado`,
      body: leftover
        ? "Mandou o que deu. O que faltou continua no pedido — não finge que saiu tudo."
        : "Saiu da fábrica. A loja ainda precisa conferir o que chegou.",
      refId: requestId,
    });
  });

  return transferId;
}

export async function cancelRequest(requestId: string) {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || !isOpenRequest(request.status)) {
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
