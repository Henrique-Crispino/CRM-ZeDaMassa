import { isSoldAtRegister } from "./categories";
import { getCustomer } from "./customers";
import { getDb } from "./db";
import { newId } from "./money";
import { catalogItems } from "./queries";
import { coverageStatus, loadFactoryWell, type RequestItemView } from "./requests";
import {
  closedCatalogMessage,
  customerKind,
  factoryOrderStatusLabel,
  isOpenRequest,
  productIsLive,
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

async function notify(input: {
  type: "factory_order" | "factory_order_cancelled";
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
    if (!isSoldAtRegister(found.product.category)) {
      throw new FactoryOrderError(`${found.product.name} não sai da câmara para cliente. Só salgado e bebida.`);
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
