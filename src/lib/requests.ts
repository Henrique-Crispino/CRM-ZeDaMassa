import { assertOperatorCanCash, stampActor } from "./actor";
import { currentCashSession } from "./cash";
import {
  encomendaPaymentsOf,
  recordEncomendaSignalInTx,
  validateEncomendaSignalAmount,
} from "./encomendas";
import { getDb } from "./db";
import { getLocation, isStore } from "./locations";
import { formatDate, formatTime, newId, todayDate } from "./money";
import { catalogItems, sellableQty, stockByLocation } from "./queries";
import { sendToStore, StockError } from "./stock";
import type { AppNotification, NotificationAudience, PaymentMethod, RequestStatus, SalePayment, StockRequest, StoreRequestKind } from "./types";
import {
  closedCatalogMessage,
  encomendaFactoryReady,
  isOpenRequest,
  productIsLive,
  requestStatusLabel,
  storeRequestKind,
  transferStatus,
} from "./types";

export class RequestError extends Error {}

export type RequestItemView = {
  nicheId: string;
  label: string;
  qty: number;
  sentQty: number;
  remaining: number;
  factoryQty: number;
  availableQty: number;
  storeWaitingQty: number;
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

export async function notifyFactoryOfEncomenda(requestId: string) {
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || storeRequestKind(request) !== "encomenda" || !request.signalSaleId) return;

  const items = await db.requestItems.where("requestId").equals(requestId).toArray();
  const catalog = await catalogItems(false);
  const storeName = getLocation(request.fromLocationId)?.name ?? "loja";
  const neededBy = request.neededBy ?? "";
  const labels = items
    .map((item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return found ? `${item.qty} ${found.label}` : `${item.qty}`;
    })
    .slice(0, 4)
    .join(", ");
  const units = items.reduce((sum, item) => sum + item.qty, 0);
  const weekday = neededBy
    ? new Date(`${neededBy}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })
    : "";

  await notify({
    type: "store_request",
    title: `${storeName} encomendou para ${weekday}`,
    body: `${labels} · ${formatDate(neededBy)} · ${units} un. · sinal recebido`,
    refId: requestId,
  });
}

export function coverageStatus(items: Pick<RequestItemView, "remaining" | "availableQty" | "sentQty">[]): RequestStatus {
  const open = items.filter((item) => item.remaining > 0);
  if (open.length === 0) return "sent";
  if (open.every((item) => item.availableQty <= 0)) return "sem_saldo";
  if (items.some((item) => item.sentQty > 0) || open.some((item) => item.availableQty < item.remaining)) {
    return "parcial";
  }
  return "pending";
}

/** Grava sem_saldo/parcial/pending no banco quando o poço muda — a UI e o histórico leem o mesmo status. */
export async function syncOpenWellStatuses(db = getDb()) {
  const { storeClaims, customerClaims } = await loadFactoryWell();
  for (const claim of storeClaims) {
    const row = await db.requests.get(claim.id);
    if (!row || !isOpenRequest(row.status)) continue;
    const live = coverageStatus(claim.items);
    if (live !== row.status && isOpenRequest(live)) {
      await db.requests.update(claim.id, { status: live });
    }
  }
  for (const claim of customerClaims) {
    const row = await db.factoryOrders.get(claim.id);
    if (!row || !isOpenRequest(row.status)) continue;
    const live = coverageStatus(claim.items);
    if (live !== row.status && isOpenRequest(live)) {
      await db.factoryOrders.update(claim.id, { status: live });
    }
  }
}

export async function createStoreRequest(input: {
  fromLocationId: string;
  note?: string;
  kind?: StoreRequestKind;
  neededBy?: string;
  guestName?: string;
  estimatedTotal?: number;
  items: { nicheId: string; qty: number }[];
  signal?: { amount: number; payment?: PaymentMethod; payments?: SalePayment[] };
}) {
  if (!isStore(input.fromLocationId)) {
    throw new RequestError("Só a loja pede produto para a fábrica.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new RequestError("Escolha pelo menos um produto e a quantidade.");
  }

  const kind = storeRequestKind({ kind: input.kind });
  const neededBy = input.neededBy?.trim() ?? "";
  if (kind === "encomenda") {
    if (!neededBy) throw new RequestError("A encomenda precisa do dia da festa.");
    if (neededBy < todayDate()) throw new RequestError("A data da encomenda não pode ser no passado.");
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
  const units = items.reduce((sum, item) => sum + item.qty, 0);
  const labels = items
    .map((item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return found ? `${item.qty} ${found.label}` : `${item.qty}`;
    })
    .slice(0, 4)
    .join(", ");

  const guestName = input.guestName?.trim() ?? "";
  const estimatedTotal =
    kind === "encomenda" && Number.isFinite(input.estimatedTotal) ? Math.max(0, Number(input.estimatedTotal)) : undefined;

  let signalWrite:
    | {
        amount: number;
        payments: SalePayment[];
        sessionId: string;
        saleId: string;
        actorId: string;
        at: string;
      }
    | undefined;
  if (input.signal) {
    if (kind !== "encomenda") {
      throw new RequestError("Sinal só entra na encomenda da loja.");
    }
    const amount = validateEncomendaSignalAmount({ estimatedTotal }, input.signal.amount);
    const cashActor = await assertOperatorCanCash(RequestError);
    const session = await currentCashSession(input.fromLocationId);
    if (!session) throw new RequestError("Abra o caixa deste período antes de receber o sinal.");
    signalWrite = {
      amount,
      payments: encomendaPaymentsOf(amount, input.signal),
      sessionId: session.id,
      saleId: newId(),
      actorId: cashActor.actorId,
      at: new Date().toISOString(),
    };
  }

  const actor = await stampActor(RequestError);

  await db.transaction("rw", [db.requests, db.requestItems, db.notifications, db.sales, db.cashSessions], async () => {
    await db.requests.add({
      id: requestId,
      fromLocationId: input.fromLocationId,
      status: "pending",
      note: input.note?.trim() ?? "",
      at,
      kind,
      neededBy: kind === "encomenda" ? neededBy : undefined,
      guestName: guestName || undefined,
      estimatedTotal,
      actorId: actor.actorId,
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
    if (signalWrite) {
      const live = await db.cashSessions.get(signalWrite.sessionId);
      if (!live || live.closedAt || live.locationId !== input.fromLocationId) {
        throw new RequestError("Abra o caixa deste período antes de receber o sinal.");
      }
      await recordEncomendaSignalInTx(db, {
        requestId,
        locationId: input.fromLocationId,
        amount: signalWrite.amount,
        payments: signalWrite.payments,
        actorId: signalWrite.actorId,
        at: signalWrite.at,
        sessionId: live.id,
        saleId: signalWrite.saleId,
      });
    }
    if (kind === "reposicao") {
      await notify({
        type: "store_request",
        title: `${storeName} pediu produto`,
        body: labels,
        refId: requestId,
      });
    } else if (signalWrite) {
      const weekday = new Date(`${neededBy}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
      await notify({
        type: "store_request",
        title: `${storeName} encomendou para ${weekday}`,
        body: `${labels} · ${formatDate(neededBy)} · ${units} un. · sinal recebido`,
        refId: requestId,
      });
    }
  });

  await syncOpenWellStatuses();
  return requestId;
}

type WellSource = "store" | "customer";

export type WellClaim = {
  id: string;
  source: WellSource;
  fromLocationId?: string;
  customerId?: string;
  name: string;
  status: RequestStatus;
  note: string;
  at: string;
  resolvedAt?: string;
  kind?: StoreRequestKind;
  neededBy?: string;
  guestName?: string;
  estimatedTotal?: number;
  signalAmount?: number;
  signalSaleId?: string;
  remainderSaleId?: string;
  deliveredAt?: string;
  items: RequestItemView[];
};

function claimLines(
  rows: { nicheId: string; qty: number; sentQty?: number }[],
  catalog: Awaited<ReturnType<typeof catalogItems>>,
  sellable: Map<string, number>,
): RequestItemView[] {
  return rows.map((item) => {
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
      storeWaitingQty: 0,
    };
  });
}

export async function loadFactoryWell() {
  const db = getDb();
  const [requests, requestItems, orders, orderItems, customers, catalog, stock] = await Promise.all([
    db.requests.toArray(),
    db.requestItems.toArray(),
    db.factoryOrders.toArray(),
    db.factoryOrderItems.toArray(),
    db.customers.toArray(),
    catalogItems(false),
    stockByLocation(),
  ]);

  const sellable = new Map(stock.map((row) => [row.niche.id, sellableQty(row, "factory")]));
  const leftover = new Map(sellable);
  const customerName = new Map(customers.map((row) => [row.id, row.name]));

  const storeClaims: WellClaim[] = requests.map((request) => ({
    id: request.id,
    source: "store",
    fromLocationId: request.fromLocationId,
    name: getLocation(request.fromLocationId)?.name ?? "Loja",
    status: request.status,
    note: request.note,
    at: request.at,
    resolvedAt: request.resolvedAt,
    kind: storeRequestKind(request),
    neededBy: request.neededBy,
    guestName: request.guestName,
    estimatedTotal: request.estimatedTotal,
    signalAmount: request.signalAmount,
    signalSaleId: request.signalSaleId,
    remainderSaleId: request.remainderSaleId,
    deliveredAt: request.deliveredAt,
    items: claimLines(
      requestItems.filter((item) => item.requestId === request.id),
      catalog,
      sellable,
    ),
  }));

  const customerClaims: WellClaim[] = orders.map((order) => ({
    id: order.id,
    source: "customer",
    customerId: order.customerId,
    name: customerName.get(order.customerId) ?? "Cliente",
    status: order.status,
    note: order.note,
    at: order.at,
    resolvedAt: order.resolvedAt,
    items: claimLines(
      orderItems.filter((item) => item.orderId === order.id),
      catalog,
      sellable,
    ),
  }));

  const open = [...storeClaims, ...customerClaims]
    .filter((claim) => isOpenRequest(claim.status) && encomendaFactoryReady(claim))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  for (const claim of open) {
    for (const line of claim.items) {
      const left = leftover.get(line.nicheId) ?? 0;
      line.availableQty = Math.min(line.remaining, left);
      leftover.set(line.nicheId, left - line.availableQty);
    }
  }

  for (const claim of [...storeClaims, ...customerClaims]) {
    for (const line of claim.items) {
      line.storeWaitingQty = storeClaims
        .filter((row) => isOpenRequest(row.status))
        .reduce(
          (sum, row) => sum + (row.items.find((item) => item.nicheId === line.nicheId)?.availableQty ?? 0),
          0,
        );
    }
  }

  return { sellable, leftover, storeClaims, customerClaims };
}

export type FactoryStockRow = {
  nicheId: string;
  label: string;
  physical: number;
  sellable: number;
  expired: number;
  reserved: number;
  free: number;
  inTransit: number;
};

export async function factoryStockPosition(): Promise<FactoryStockRow[]> {
  const db = getDb();
  const [catalog, stock, well, transfers, transferItems] = await Promise.all([
    catalogItems(false),
    stockByLocation(),
    loadFactoryWell(),
    db.transfers.toArray(),
    db.transferItems.toArray(),
  ]);

  const inTransitByNiche = new Map<string, number>();
  for (const transfer of transfers) {
    if (transfer.fromLocationId !== "factory" || transferStatus(transfer) !== "em_transito") continue;
    for (const part of transferItems.filter((row) => row.transferId === transfer.id)) {
      inTransitByNiche.set(part.nicheId, (inTransitByNiche.get(part.nicheId) ?? 0) + part.qty);
    }
  }

  const rows: FactoryStockRow[] = [];
  for (const item of stock) {
    if (!productIsLive(item.product)) continue;
    const physical = item.qty.factory ?? 0;
    const expired = item.expiredQty.factory ?? 0;
    const sellable = sellableQty(item, "factory");
    const free = well.leftover.get(item.niche.id) ?? 0;
    const reserved = Math.max(0, sellable - free);
    const inTransit = inTransitByNiche.get(item.niche.id) ?? 0;
    if (physical <= 0 && sellable <= 0 && reserved <= 0 && free <= 0 && inTransit <= 0) continue;
    rows.push({
      nicheId: item.niche.id,
      label: item.label,
      physical,
      sellable,
      expired,
      reserved,
      free,
      inTransit,
    });
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function factoryFreeByNiche() {
  const { leftover } = await loadFactoryWell();
  return leftover;
}

export async function assertFactoryFreeQty(items: { nicheId: string; qty: number }[]) {
  const { leftover, storeClaims, customerClaims } = await loadFactoryWell();
  const open = [...storeClaims, ...customerClaims].filter((claim) => isOpenRequest(claim.status));
  for (const item of items) {
    if (item.qty <= 0) continue;
    const holders = open.filter(
      (claim) => (claim.items.find((line) => line.nicheId === item.nicheId)?.availableQty ?? 0) > 0,
    );
    if (holders.length === 0) continue;
    const free = leftover.get(item.nicheId) ?? 0;
    if (item.qty <= free) continue;
    const label = holders[0]?.items.find((line) => line.nicheId === item.nicheId)?.label ?? "Produto";
    const names = [...new Set(holders.map((claim) => claim.name))];
    if (free <= 0) {
      throw new StockError(
        `${label}: o que tem na câmara já está no pedido de ${names.join(" e ")}. Mande pelo Pedidos.`,
      );
    }
    throw new StockError(
      `${label}: só ${free} livres. O resto já está no pedido de ${names.join(" e ")}. Mande pelo Pedidos.`,
    );
  }
}

function asRequestView(claim: WellClaim): RequestView {
  const live = isOpenRequest(claim.status) ? coverageStatus(claim.items) : claim.status;
  return {
    id: claim.id,
    fromLocationId: claim.fromLocationId ?? "",
    status: live,
    note: claim.note,
    at: claim.at,
    resolvedAt: claim.resolvedAt,
    kind: claim.kind,
    neededBy: claim.neededBy,
    guestName: claim.guestName,
    estimatedTotal: claim.estimatedTotal,
    signalAmount: claim.signalAmount,
    signalSaleId: claim.signalSaleId,
    remainderSaleId: claim.remainderSaleId,
    deliveredAt: claim.deliveredAt,
    statusLabel: requestStatusLabel(live),
    storeName: claim.name,
    items: claim.items,
  };
}

export async function listRequests(
  status?: RequestStatus | "open",
  opts?: { factoryQueue?: boolean },
): Promise<RequestView[]> {
  const { storeClaims } = await loadFactoryWell();
  return storeClaims
    .filter((claim) => {
      if (opts?.factoryQueue && !encomendaFactoryReady(claim)) return false;
      if (!status) return true;
      if (status === "open" || status === "pending") return isOpenRequest(claim.status);
      return claim.status === status;
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(asRequestView);
}

export async function fulfillRequest(
  requestId: string,
  qtyByNiche?: Record<string, number>,
  _sentBy?: string,
) {
  const actor = await stampActor(RequestError);
  const db = getDb();
  let transferId = "";

  try {
    await db.transaction(
      "rw",
      [
        db.stock,
        db.lots,
        db.movements,
        db.transfers,
        db.transferItems,
        db.requests,
        db.requestItems,
        db.notifications,
        db.niches,
        db.products,
        db.factoryOrders,
        db.factoryOrderItems,
        db.customers,
        db.employees,
      ],
      async () => {
        const request = await db.requests.get(requestId);
        if (!request || !isOpenRequest(request.status)) {
          throw new RequestError("Esse pedido já foi resolvido.");
        }
        if (storeRequestKind(request) === "encomenda" && !request.signalSaleId) {
          throw new RequestError("A loja ainda não recebeu o sinal desta festa.");
        }

        const views = await listRequests(undefined, { factoryQueue: true });
        const view = views.find((row) => row.id === requestId);
        if (!view) throw new RequestError("Esse pedido já foi resolvido.");

        const items = await db.requestItems.where("requestId").equals(requestId).toArray();
        const payload = items
          .map((item) => {
            const line = view.items.find((row) => row.nicheId === item.nicheId);
            const remaining = Math.max(0, item.qty - (item.sentQty ?? 0));
            const available = line?.availableQty ?? 0;
            const asked = qtyByNiche?.[item.nicheId] ?? available;
            const qty = Math.max(0, Math.floor(asked));
            return { item, line, remaining, available, qty };
          })
          .filter((row) => row.qty > 0);

        if (payload.length === 0) {
          throw new RequestError("Informe o que vai mandar.");
        }

        for (const row of payload) {
          if (row.qty > row.available) {
            throw new RequestError(
              `Não tem ${row.qty} livres neste pedido de ${row.line?.label ?? "produto"}. A câmara reserva ${row.available}; o resto já está na fila.`,
            );
          }
          if (row.qty > row.remaining) {
            throw new RequestError("Não dá para mandar mais do que o pedido.");
          }
        }

        transferId = await sendToStore({
          toLocationId: request.fromLocationId,
          items: payload.map((row) => ({ nicheId: row.item.nicheId, qty: row.qty })),
          respectWell: false,
          requestId,
        });

        const at = new Date().toISOString();
        const storeName = getLocation(request.fromLocationId)?.name ?? "loja";

        for (const row of payload) {
          const fresh = await db.requestItems.get(row.item.id);
          await db.requestItems.update(row.item.id, {
            sentQty: (fresh?.sentQty ?? 0) + row.qty,
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
      },
    );
  } catch (error) {
    if (error instanceof StockError) throw error;
    throw error;
  }

  await syncOpenWellStatuses();
  return transferId;
}

export async function cancelRequest(requestId: string) {
  const actor = await stampActor(RequestError);
  const db = getDb();
  const request = await db.requests.get(requestId);
  if (!request || !isOpenRequest(request.status)) {
    throw new RequestError("Esse pedido já foi resolvido.");
  }
  const storeName = getLocation(request.fromLocationId)?.name ?? "loja";
  await db.requests.update(requestId, {
    status: "cancelled",
    resolvedAt: new Date().toISOString(),
    cancelledById: actor.actorId,
  });
  await notify({
    type: "request_cancelled",
    title: `Pedido da ${storeName} foi dispensado`,
    body: "A fábrica não vai mandar este pedido.",
    refId: requestId,
  });
  await syncOpenWellStatuses();
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
