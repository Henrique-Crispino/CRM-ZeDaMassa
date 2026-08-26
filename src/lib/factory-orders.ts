import { isSoldAtFactory } from "./categories";
import { getCustomer } from "./customers";
import { getDb } from "./db";
import { formatBRL, newId } from "./money";
import { catalogItems } from "./queries";
import { coverageStatus, loadFactoryWell, type RequestItemView } from "./requests";
import { assertLiveNiches, StockError } from "./stock";
import { changeStock, oldestLots } from "./stock-core";
import {
  closedCatalogMessage,
  customerKind,
  factoryOrderStatusLabel,
  isOpenRequest,
  lotCost,
  lotPrice,
  PAYMENT_METHODS,
  paymentMethodLabel,
  productIsLive,
  type PaymentMethod,
  type RequestStatus,
} from "./types";

export class FactoryOrderError extends Error {}

export type FactoryOrderView = {
  id: string;
  customerId: string;
  customerName: string;
  status: RequestStatus;
  statusLabel: string;
  note: string;
  at: string;
  resolvedAt?: string;
  items: RequestItemView[];
};

export type FactoryOrderQuote = {
  qty: number;
  cost: number;
  revenue: number;
  lines: { nicheId: string; label: string; qty: number; cost: number; revenue: number }[];
};

type DeliveryRow = {
  item: { id: string; nicheId: string; qty: number; sentQty?: number };
  line?: RequestItemView;
  remaining: number;
  available: number;
  qty: number;
};

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function requirePayment(payment?: { method: PaymentMethod }): PaymentMethod {
  const method = payment?.method;
  if (!PAYMENT_METHODS.some((item) => item.id === method)) {
    throw new FactoryOrderError("Diga como pagou: dinheiro, Pix ou cartão.");
  }
  return method;
}

async function planFactoryDelivery(orderId: string, qtyByNiche?: Record<string, number>) {
  const db = getDb();
  const order = await db.factoryOrders.get(orderId);
  if (!order || !isOpenRequest(order.status)) {
    throw new FactoryOrderError("Esse pedido já foi resolvido.");
  }

  const views = await listFactoryOrders();
  const view = views.find((row) => row.id === orderId);
  if (!view) throw new FactoryOrderError("Esse pedido já foi resolvido.");

  const items = await db.factoryOrderItems.where("orderId").equals(orderId).toArray();
  const payload: DeliveryRow[] = items
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
    throw new FactoryOrderError("Informe o que o cliente levou.");
  }

  for (const row of payload) {
    if (row.qty > row.available) {
      throw new FactoryOrderError(
        `Não tem ${row.qty} livres neste pedido de ${row.line?.label ?? "produto"}. A câmara reserva ${row.available}; o resto já está na fila da loja.`,
      );
    }
    if (row.qty > row.remaining) {
      throw new FactoryOrderError("Não dá para levar mais do que o pedido.");
    }
  }

  return { order, view, payload };
}

async function notify(input: {
  type: "factory_order" | "factory_order_cancelled" | "factory_order_delivered";
  title: string;
  body: string;
  refId: string;
}) {
  const db = getDb();
  const at = new Date().toISOString();
  await db.notifications.bulkAdd(
    (["admin", "factory"] as const).map((audience) => ({
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

export async function createFactoryOrder(input: {
  customerId: string;
  note?: string;
  items: { nicheId: string; qty: number }[];
}) {
  const customer = await getCustomer(input.customerId);
  if (!customer) throw new FactoryOrderError("Cliente não encontrado.");
  if (customerKind(customer) !== "volume") {
    throw new FactoryOrderError("Só quem compra na fábrica monta pedido da câmara. Marque o cadastro.");
  }

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) {
    throw new FactoryOrderError("Escolha pelo menos um produto e a quantidade.");
  }

  const catalog = await catalogItems(false);
  for (const item of items) {
    const found = catalog.find((row) => row.niche.id === item.nicheId);
    if (!found) throw new FactoryOrderError("Produto não encontrado.");
    if (!productIsLive(found.product)) {
      throw new FactoryOrderError(closedCatalogMessage(found.product.name));
    }
    if (!isSoldAtFactory(found.product.category)) {
      throw new FactoryOrderError(`${found.product.name} não sai da câmara para cliente. Quem compra na fábrica leva só salgado.`);
    }
  }

  const db = getDb();
  const orderId = newId();
  const at = new Date().toISOString();
  const labels = items
    .map((item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return found ? `${item.qty} ${found.label}` : `${item.qty}`;
    })
    .slice(0, 4)
    .join(", ");

  await db.transaction("rw", [db.factoryOrders, db.factoryOrderItems, db.notifications], async () => {
    await db.factoryOrders.add({
      id: orderId,
      customerId: customer.id,
      status: "pending",
      note: input.note?.trim() ?? "",
      at,
    });
    for (const item of items) {
      await db.factoryOrderItems.add({
        id: newId(),
        orderId,
        nicheId: item.nicheId,
        qty: item.qty,
        sentQty: 0,
      });
    }
    await notify({
      type: "factory_order",
      title: `${customer.name} pediu na câmara`,
      body: labels,
      refId: orderId,
    });
  });

  return orderId;
}

export async function listFactoryOrders(status?: RequestStatus | "open"): Promise<FactoryOrderView[]> {
  const { customerClaims } = await loadFactoryWell();
  return customerClaims
    .filter((claim) => {
      if (!status) return true;
      if (status === "open" || status === "pending") return isOpenRequest(claim.status);
      return claim.status === status;
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((claim) => {
      const live = isOpenRequest(claim.status) ? coverageStatus(claim.items) : claim.status;
      return {
        id: claim.id,
        customerId: claim.customerId ?? "",
        customerName: claim.name,
        status: live,
        statusLabel: factoryOrderStatusLabel(live),
        note: claim.note,
        at: claim.at,
        resolvedAt: claim.resolvedAt,
        items: claim.items,
      };
    });
}

export async function lastFactoryOrder(customerId: string) {
  const db = getDb();
  const orders = await db.factoryOrders.where("customerId").equals(customerId).toArray();
  if (orders.length === 0) return null;
  const last = orders.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))[0];
  const items = await db.factoryOrderItems.where("orderId").equals(last.id).toArray();
  const catalog = await catalogItems(false);
  const salgados = items
    .filter((item) => {
      const found = catalog.find((row) => row.niche.id === item.nicheId);
      return found ? isSoldAtFactory(found.product.category) : false;
    })
    .map((item) => ({ nicheId: item.nicheId, qty: item.qty }));
  return salgados.length ? salgados : null;
}

export async function quoteFactoryOrder(
  orderId: string,
  qtyByNiche?: Record<string, number>,
): Promise<FactoryOrderQuote> {
  const { payload } = await planFactoryDelivery(orderId, qtyByNiche);
  const catalog = await catalogItems(false);
  const db = getDb();
  const lines: FactoryOrderQuote["lines"] = [];
  let qty = 0;
  let cost = 0;
  let revenue = 0;

  for (const row of payload) {
    const chunks = await oldestLots("factory", row.item.nicheId, row.qty, { skipExpired: true });
    const found = catalog.find((item) => item.niche.id === row.item.nicheId);
    let lineCost = 0;
    let lineRev = 0;
    for (const chunk of chunks) {
      const lot = await db.lots.get(chunk.lotId);
      lineCost += chunk.qty * lotCost(lot, found?.niche.costPrice ?? 0);
      lineRev += chunk.qty * lotPrice(lot, found?.niche.sellPrice ?? 0);
    }
    qty += row.qty;
    cost += lineCost;
    revenue += lineRev;
    lines.push({
      nicheId: row.item.nicheId,
      label: row.line?.label ?? found?.label ?? "Produto",
      qty: row.qty,
      cost: cents(lineCost),
      revenue: cents(lineRev),
    });
  }

  return { qty, cost: cents(cost), revenue: cents(revenue), lines };
}

export async function cancelFactoryOrder(orderId: string) {
  const db = getDb();
  const order = await db.factoryOrders.get(orderId);
  if (!order || !isOpenRequest(order.status)) {
    throw new FactoryOrderError("Esse pedido já foi resolvido.");
  }
  const customer = await getCustomer(order.customerId);
  await db.factoryOrders.update(orderId, { status: "cancelled", resolvedAt: new Date().toISOString() });
  await notify({
    type: "factory_order_cancelled",
    title: `Pedido de ${customer?.name ?? "cliente"} foi dispensado`,
    body: "A câmara não vai separar este pedido.",
    refId: orderId,
  });
}

export async function deliverFactoryOrder(
  orderId: string,
  qtyByNiche?: Record<string, number>,
  payment?: { method: PaymentMethod },
) {
  const method = requirePayment(payment);
  const db = getDb();

  try {
    return await db.transaction(
      "rw",
      [
        db.stock,
        db.lots,
        db.movements,
        db.factoryOrders,
        db.factoryOrderItems,
        db.notifications,
        db.niches,
        db.products,
        db.requests,
        db.requestItems,
        db.customers,
      ],
      async () => {
        const { order, payload } = await planFactoryDelivery(orderId, qtyByNiche);

        try {
          await assertLiveNiches(payload.map((row) => row.item.nicheId));
        } catch (err) {
          throw err instanceof StockError ? new FactoryOrderError(err.message) : err;
        }

        const catalog = await catalogItems(false);
        for (const row of payload) {
          const found = catalog.find((item) => item.niche.id === row.item.nicheId);
          if (found && !isSoldAtFactory(found.product.category)) {
            throw new FactoryOrderError(`${found.product.name} não sai da câmara para cliente. Quem compra na fábrica leva só salgado.`);
          }
        }

        const at = new Date().toISOString();
        const customer = await getCustomer(order.customerId);
        let amount = 0;

        for (const row of payload) {
          const chunks = await oldestLots("factory", row.item.nicheId, row.qty, { skipExpired: true });
          const found = catalog.find((item) => item.niche.id === row.item.nicheId);
          for (const chunk of chunks) {
            const lot = await db.lots.get(chunk.lotId);
            const unitCost = lotCost(lot, found?.niche.costPrice ?? 0);
            const unitPrice = cents(lotPrice(lot, found?.niche.sellPrice ?? 0));
            const chunkMoney = cents(unitPrice * chunk.qty);
            amount = cents(amount + chunkMoney);
            await changeStock("factory", row.item.nicheId, chunk.lotId, -chunk.qty);
            await db.movements.add({
              id: newId(),
              locationId: "factory",
              nicheId: row.item.nicheId,
              lotId: chunk.lotId,
              qty: -chunk.qty,
              type: "cliente",
              refId: orderId,
              at,
              unitCost,
              unitPrice,
              payment: method,
            });
          }
          const fresh = await db.factoryOrderItems.get(row.item.id);
          await db.factoryOrderItems.update(row.item.id, {
            sentQty: (fresh?.sentQty ?? 0) + row.qty,
          });
        }

        const updated = await db.factoryOrderItems.where("orderId").equals(orderId).toArray();
        const leftover = updated.some((item) => (item.sentQty ?? 0) < item.qty);
        await db.factoryOrders.update(orderId, {
          status: leftover ? "parcial" : "sent",
          resolvedAt: leftover ? undefined : at,
        });

        const paid = `${formatBRL(amount)} no ${paymentMethodLabel(method)}`;
        await notify({
          type: "factory_order_delivered",
          title: leftover
            ? `${customer?.name ?? "Cliente"} levou parte`
            : `${customer?.name ?? "Cliente"} levou o pedido`,
          body: leftover
            ? `Saiu da câmara o que cabia. Recebeu ${paid}. O que faltou continua no pedido — não finge que saiu tudo.`
            : `Saiu da câmara. Recebeu ${paid} na fábrica. A loja não ganhou estoque.`,
          refId: orderId,
        });

        return { amount, method, leftover };
      },
    );
  } catch (err) {
    if (err instanceof StockError) throw new FactoryOrderError(err.message);
    throw err;
  }
}
