import { indexedDB, IDBKeyRange } from "fake-indexeddb";

Object.assign(globalThis, { indexedDB, IDBKeyRange });
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
} as Storage;

type Result = { name: string; pass: boolean; detail: string };
const rows: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  rows.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectOk(name: string, fn: () => Promise<unknown>) {
  try {
    const value = await fn();
    record(name, true, typeof value === "string" ? value.slice(0, 80) : "");
    return value;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function expectFail(name: string, fn: () => Promise<unknown>, match?: string) {
  try {
    await fn();
    record(name, false, "deveria ter recusado e passou");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ok = match ? message.toLowerCase().includes(match.toLowerCase()) : true;
    record(name, ok, message);
  }
}

async function main() {
  const { getDb } = await import("../src/lib/db.ts");
  const { refreshLocations, DEFAULT_STORES } = await import("../src/lib/locations.ts");
  const { DEFAULT_EMPLOYEES } = await import("../src/lib/seed.ts");
  const { todayDate, addDays } = await import("../src/lib/money.ts");
  const { stockQty } = await import("../src/lib/stock-core.ts");
  const {
    produceItems,
    receivePurchase,
    sendToStore,
    receiveTransfer,
    returnToFactory,
    receiveReturn,
    checkout,
    voidSale,
    registerWaste,
    discardExpiredLots,
    applyInventory,
    openPackages,
  } = await import("../src/lib/stock.ts");
  const { openCashSession, registerCashMovement, closeCashSession, reopenCashSession, currentCashSession, sessionLedger } =
    await import("../src/lib/cash.ts");
  const { createStoreRequest, fulfillRequest, listRequests } = await import("../src/lib/requests.ts");
  const { registerInternalConsume } = await import("../src/lib/consume.ts");
  const { reportDayPack, reportWindow } = await import("../src/lib/reports.ts");
  const { catalogItems, inventorySheet, setProductActive } = await import("../src/lib/queries.ts");
  const db = getDb();
  const today = todayDate();

  await db.products.bulkAdd([
    { id: "prod-coxinha", name: "Coxinha", category: "salgado", perishable: true, shelfLifeDays: 2, createdAt: `${today}T10:00:00.000Z` },
    { id: "prod-coca", name: "Coca-Cola 350ml", category: "bebida", perishable: false, shelfLifeDays: 0, createdAt: `${today}T10:00:00.000Z` },
  ]);
  await db.niches.bulkAdd([
    { id: "cox-mini", productId: "prod-coxinha", name: "Mini", sellPrice: 1.5, costPrice: 0.45, minStock: 30, minStockFactory: 180, minStockStore: 30, active: true, promoAllowed: true, promoPrice: 1.2, promoFrom: `${today}T00:00:00.000Z`, promoTo: `${addDays(today, 14)}T23:59:59.999Z` },
    { id: "coca-350", productId: "prod-coca", name: "Lata", sellPrice: 6, costPrice: 3.2, minStock: 10, minStockFactory: 40, minStockStore: 10, active: true, promoAllowed: false, promoPrice: 0 },
  ]);
  await db.stores.bulkAdd(DEFAULT_STORES);
  await db.employees.bulkAdd(DEFAULT_EMPLOYEES);
  await db.internalAllowances.bulkAdd([
    { id: "cox-mini", nicheId: "cox-mini", enabled: true, dailyLimit: 5, personLimit: 2 },
  ]);
  await refreshLocations();

  await expectFail("Produzir bebida é recusado", () => produceItems({ madeAt: today, items: [{ nicheId: "coca-350", qty: 10 }] }), "não se produz");
  await expectFail("Comprar salgado é recusado", () => receivePurchase({ receivedAt: today, items: [{ nicheId: "cox-mini", qty: 10, unitCost: 0.4 }] }), "fabricado");
  await expectOk("Produzir coxinha na fábrica", () => produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 100 }] }));
  await expectOk("Comprar Coca na fábrica", () => receivePurchase({ receivedAt: today, items: [{ nicheId: "coca-350", qty: 40, unitCost: 3.1 }] }));

  await db.products.add({
    id: "prod-suco",
    name: "Suco de laranja",
    category: "bebida",
    perishable: true,
    shelfLifeDays: 7,
    createdAt: `${today}T10:00:00.000Z`,
  });
  await db.niches.add({
    id: "suco-1l",
    productId: "prod-suco",
    name: "Garrafa 1L",
    sellPrice: 8,
    costPrice: 4,
    minStock: 6,
    minStockFactory: 20,
    minStockStore: 6,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });
  await expectFail(
    "Compra de suco perecível sem validade é recusada",
    () => receivePurchase({ receivedAt: today, items: [{ nicheId: "suco-1l", qty: 6, unitCost: 4 }] }),
    "validade",
  );
  await expectFail(
    "Validade do suco antes da entrada é recusada",
    () =>
      receivePurchase({
        receivedAt: today,
        items: [{ nicheId: "suco-1l", qty: 6, unitCost: 4, expiresAt: addDays(today, -1) }],
      }),
    "antes",
  );
  await expectOk("Compra de suco com validade grava o lote", () =>
    receivePurchase({
      receivedAt: today,
      items: [{ nicheId: "suco-1l", qty: 6, unitCost: 4, expiresAt: addDays(today, 7) }],
    }),
  );
  const sucoLots = (await db.lots.toArray()).filter((lot) => lot.nicheId === "suco-1l");
  record(
    "Lote de suco tem a data da validade",
    sucoLots.length === 1 && sucoLots[0]?.expiresAt === addDays(today, 7),
    JSON.stringify(sucoLots.map((lot) => lot.expiresAt)),
  );
  await expectOk("Compra suco já vencido para testar descarte", () =>
    receivePurchase({
      receivedAt: addDays(today, -10),
      items: [{ nicheId: "suco-1l", qty: 2, unitCost: 4, expiresAt: addDays(today, -1) }],
    }),
  );
  await expectOk("Mandar só o suco que ainda vale", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "suco-1l", qty: 6 }], sentBy: "Rita" }),
  );
  await expectFail(
    "Envio recusa suco vencido",
    () => sendToStore({ toLocationId: "store_1", items: [{ nicheId: "suco-1l", qty: 1 }], sentBy: "Rita" }),
    "vencido",
  );
  const expiredSuco = (
    await Promise.all(
      (await db.lots.toArray())
        .filter((lot) => lot.nicheId === "suco-1l" && lot.expiresAt && lot.expiresAt < today)
        .map(async (lot) => {
          const row = await db.stock.get(`factory:${lot.nicheId}:${lot.id}`);
          return { locationId: "factory" as const, nicheId: lot.nicheId, lotId: lot.id, qty: row?.qty ?? 0 };
        }),
    )
  ).filter((item) => item.qty > 0);
  if (expiredSuco.length) {
    await expectOk("Descarte baixa suco vencido", () => discardExpiredLots({ items: expiredSuco }));
  }

  await db.products.add({
    id: "prod-farinha",
    name: "Farinha de trigo",
    category: "insumo",
    perishable: false,
    shelfLifeDays: 0,
    createdAt: `${today}T10:00:00.000Z`,
  });
  await db.niches.add({
    id: "farinha-25kg",
    productId: "prod-farinha",
    name: "Saco 25kg",
    sellPrice: 85,
    costPrice: 85,
    minStock: 2,
    minStockFactory: 6,
    minStockStore: 0,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });
  await expectFail(
    "Produzir farinha é recusado",
    () => produceItems({ madeAt: today, items: [{ nicheId: "farinha-25kg", qty: 2 }] }),
    "não se produz",
  );
  await expectOk("Compra de farinha grava o lote", () =>
    receivePurchase({ receivedAt: today, items: [{ nicheId: "farinha-25kg", qty: 4, unitCost: 80 }] }),
  );
  const liveCatalog = await catalogItems(true);
  record(
    "Insumo entra no catálogo de compra",
    liveCatalog.some((item) => item.product.category === "insumo"),
    "",
  );

  await db.products.add({
    id: "prod-copo",
    name: "Copo 200ml",
    category: "descartavel",
    perishable: false,
    shelfLifeDays: 0,
    createdAt: `${today}T10:00:00.000Z`,
  });
  await db.niches.add({
    id: "copo-100",
    productId: "prod-copo",
    name: "Pacote 100",
    sellPrice: 8,
    costPrice: 3.5,
    minStock: 4,
    minStockFactory: 16,
    minStockStore: 4,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });
  await expectFail(
    "Produzir copo é recusado",
    () => produceItems({ madeAt: today, items: [{ nicheId: "copo-100", qty: 2 }] }),
    "não se produz",
  );
  await expectOk("Compra de copo grava o lote em pacote", () =>
    receivePurchase({ receivedAt: today, items: [{ nicheId: "copo-100", qty: 5, unitCost: 3.5 }] }),
  );
  await expectFail(
    "Abrir coxinha como pacote é recusado",
    () => openPackages({ locationId: "factory", items: [{ nicheId: "cox-mini", qty: 1 }] }),
    "não é pacote",
  );
  const copoBefore = await stockQty("factory", "copo-100");
  await expectOk("Abrir 1 pacote de copo na fábrica", () =>
    openPackages({ locationId: "factory", items: [{ nicheId: "copo-100", qty: 1 }] }),
  );
  const copoAfter = await stockQty("factory", "copo-100");
  record("Abrir pacote baixa 1 do estoque", copoBefore === 5 && copoAfter === 4, `antes=${copoBefore} depois=${copoAfter}`);

  const factoryCox = await stockQty("factory", "cox-mini");
  record("Fábrica tem 100 coxinhas após produzir", factoryCox === 100, `qty=${factoryCox}`);

  await expectFail(
    "Venda sem caixa aberto é recusada",
    () => checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 1 }] }),
    "abra o caixa",
  );
  await expectFail(
    "Venda na fábrica é recusada",
    () => checkout({ locationId: "factory", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 1 }] }),
    "loja",
  );

  const session = (await expectOk("Abrir caixa da Loja 1", () =>
    openCashSession({ locationId: "store_1", period: "manha", employeeId: "emp-ana", openingAmount: 150 }),
  )) as { id: string } | null;

  await expectFail(
    "Bruno não abre o caixa da Loja 2",
    () => openCashSession({ locationId: "store_2", period: "manha", employeeId: "emp-bruno", openingAmount: 80 }),
    "não abre",
  );

  await expectFail(
    "Venda de farinha no caixa é recusada",
    () =>
      checkout({
        locationId: "store_1",
        channel: "caixa",
        payment: "dinheiro",
        items: [{ nicheId: "farinha-25kg", qty: 1 }],
      }),
    "insumo",
  );
  await expectFail(
    "Venda de copo no caixa é recusada",
    () =>
      checkout({
        locationId: "store_1",
        channel: "caixa",
        payment: "dinheiro",
        items: [{ nicheId: "copo-100", qty: 1 }],
      }),
    "pacote",
  );

  const transferId = (await expectOk("Mandar 40 coxinhas para a Loja 1", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "cox-mini", qty: 40 }], sentBy: "Rita" }),
  )) as string | null;

  const inTransitFactory = await stockQty("factory", "cox-mini");
  const inTransitStore = await stockQty("store_1", "cox-mini");
  record("Em trânsito some da fábrica e ainda não entra na loja", inTransitFactory === 60 && inTransitStore === 0, `fábrica=${inTransitFactory} loja=${inTransitStore}`);

  await expectFail(
    "Loja não vende o que ainda está em trânsito",
    () => checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 1 }] }),
    "estoque",
  );

  if (transferId) {
    const parts = await db.transferItems.where("transferId").equals(transferId).toArray();
    await expectOk("Loja confere o envio (chegou tudo)", () =>
      receiveTransfer({
        transferId,
        receivedBy: "Ana",
        items: parts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }

  const afterReceive = await stockQty("store_1", "cox-mini");
  record("Depois de conferir, a loja tem 40", afterReceive === 40, `qty=${afterReceive}`);

  await expectOk("Venda em dinheiro", () =>
    checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 10 }] }),
  );

  const mixedId = (await expectOk("Venda mista (dinheiro + Pix)", () =>
    checkout({
      locationId: "store_1",
      channel: "caixa",
      payments: [
        { method: "dinheiro", amount: 3 },
        { method: "pix", amount: 4.5 },
      ],
      items: [{ nicheId: "cox-mini", qty: 5 }],
    }),
  )) as string | null;

  await expectFail(
    "Pagamento misto que não soma o total é recusado",
    () =>
      checkout({
        locationId: "store_1",
        channel: "caixa",
        payments: [{ method: "dinheiro", amount: 1 }],
        items: [{ nicheId: "cox-mini", qty: 2 }],
      }),
    "somar",
  );

  await expectOk("Venda em promoção vigente", () =>
    checkout({ locationId: "store_1", channel: "caixa", payment: "pix", items: [{ nicheId: "cox-mini", qty: 2, promo: true }] }),
  );

  if (mixedId) {
    await expectOk("Estorno no caixa aberto devolve o lote", () => voidSale({ saleId: mixedId, reason: "desistencia" }));
  }
  const afterVoid = await stockQty("store_1", "cox-mini");
  record("Estorno devolveu 5 un. (40-10-5-2+5)", afterVoid === 28, `qty=${afterVoid}`);

  await expectOk("Sobra do dia baixa lote válido", () =>
    registerWaste({ locationId: "store_1", items: [{ nicheId: "cox-mini", qty: 3 }] }),
  );

  await expectOk("Produzir lote já vencido (madeAt -5 dias)", () =>
    produceItems({ madeAt: addDays(today, -5), items: [{ nicheId: "cox-mini", qty: 8 }] }),
  );
  const validFactory = await stockQty("factory", "cox-mini");
  if (validFactory > 8) {
    await expectOk("Mandar só o saldo válido esgota o que não venceu", () =>
      sendToStore({ toLocationId: "store_1", items: [{ nicheId: "cox-mini", qty: validFactory - 8 }], sentBy: "Rita" }),
    );
  }
  await expectFail(
    "Envio recusa quando só resta lote vencido",
    () => sendToStore({ toLocationId: "store_1", items: [{ nicheId: "cox-mini", qty: 1 }], sentBy: "Rita" }),
    "vencido",
  );
  const expiredLots = (await db.lots.toArray()).filter((lot) => lot.expiresAt && lot.expiresAt < today && lot.nicheId === "cox-mini");
  const expiredStock = (
    await Promise.all(
      expiredLots.map(async (lot) => {
        const row = await db.stock.get(`factory:${lot.nicheId}:${lot.id}`);
        return { locationId: "factory" as const, nicheId: lot.nicheId, lotId: lot.id, qty: row?.qty ?? 0 };
      }),
    )
  ).filter((item) => item.qty > 0);
  record("Lote vencido ficou parado na fábrica", expiredStock.reduce((sum, item) => sum + item.qty, 0) === 8, JSON.stringify(expiredStock));
  if (expiredStock.length) {
    await expectOk("Descarte baixa lote vencido na fábrica", () => discardExpiredLots({ items: expiredStock }));
  }

  await expectOk("Sangria com destino cofre", () =>
    registerCashMovement({
      sessionId: session?.id ?? "",
      type: "sangria",
      amount: 20,
      reason: "Levar ao cofre no almoço",
      destination: "cofre",
    }),
  );
  await expectFail(
    "Sangria sem destino é recusada",
    () => registerCashMovement({ sessionId: session?.id ?? "", type: "sangria", amount: 5, reason: "teste" }),
    "destino",
  );

  if (session) {
    const ledger = await sessionLedger(session.id);
    await expectFail(
      "Fechar com quebra sem 2ª contagem é recusado",
      () => closeCashSession({ sessionId: session.id, closingAmount: ledger.expectedCash + 10 }),
      "conte o dinheiro",
    );
    await expectFail(
      "2ª contagem diferente da 1ª é recusada",
      () =>
        closeCashSession({
          sessionId: session.id,
          closingAmount: ledger.expectedCash + 10,
          secondCount: ledger.expectedCash + 12,
          recountedBy: "Carla",
        }),
      "bater",
    );
    await expectOk("Fechar caixa com 2ª contagem e nome", () =>
      closeCashSession({
        sessionId: session.id,
        closingAmount: ledger.expectedCash + 10,
        secondCount: ledger.expectedCash + 10,
        recountedBy: "Carla Mendes",
        note: "Faltou troco no fundo",
      }),
    );
    await expectFail(
      "Estorno com caixa fechado é recusado",
      async () => {
        const sales = await db.sales.where("cashSessionId").equals(session.id).toArray();
        const live = sales.find((sale) => !sale.voidedAt);
        if (!live) throw new Error("sem venda viva");
        await voidSale({ saleId: live.id, reason: "quantidade" });
      },
      "já fechou",
    );
    await expectFail(
      "Senha de reabertura errada é recusada",
      () => reopenCashSession({ sessionId: session.id, password: "0000", note: "Apurado saiu errado" }),
      "não confere",
    );
    await expectOk("Admin reabre o caixa do dia", () =>
      reopenCashSession({ sessionId: session.id, password: "reabrir", note: "Apurado saiu errado na 1ª vez" }),
    );
  }

  await expectOk("Produzir de novo para o furo do pedido e da divergência", () =>
    produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 50 }] }),
  );
  const factoryBeforeGap = await stockQty("factory", "cox-mini");
  const gapId = (await expectOk("Mandar 10 para a Loja 2 (vai conferir a menos)", () =>
    sendToStore({ toLocationId: "store_2", items: [{ nicheId: "cox-mini", qty: 10 }], sentBy: "Rita" }),
  )) as string | null;
  if (gapId) {
    const parts = await db.transferItems.where("transferId").equals(gapId).toArray();
    await expectOk("Loja 2 confere 7 de 10", () => {
      let missing = 3;
      return receiveTransfer({
        transferId: gapId,
        receivedBy: "Carla",
        items: parts.map((part) => {
          const cut = Math.min(missing, part.qty);
          missing -= cut;
          return { id: part.id, receivedQty: part.qty - cut };
        }),
      });
    });
    const factoryAfterGap = await stockQty("factory", "cox-mini");
    const store2AfterGap = await stockQty("store_2", "cox-mini");
    const vanished = factoryBeforeGap - factoryAfterGap - store2AfterGap;
    record(
      "Conferência a menos devolve o que faltou à fábrica",
      vanished === 0 && store2AfterGap === 7 && factoryAfterGap === factoryBeforeGap - 7,
      `sumiu=${vanished} fábrica=${factoryAfterGap} loja2=${store2AfterGap} esperadoFábrica=${factoryBeforeGap - 7}`,
    );
  }

  const cocaId = (await expectOk("Mandar 5 Coca para testar conferência a mais", () =>
    sendToStore({ toLocationId: "store_2", items: [{ nicheId: "coca-350", qty: 5 }], sentBy: "Rita" }),
  )) as string | null;
  if (cocaId) {
    const cocaParts = await db.transferItems.where("transferId").equals(cocaId).toArray();
    await expectFail(
      "Conferência a mais é recusada",
      () =>
        receiveTransfer({
          transferId: cocaId,
          receivedBy: "Carla",
          items: cocaParts.map((part) => ({ id: part.id, receivedQty: part.qty + 3 })),
        }),
      "mais do que",
    );
    await expectOk("Loja 2 confere as 5 Coca do romaneio", () =>
      receiveTransfer({
        transferId: cocaId,
        receivedBy: "Carla",
        items: cocaParts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }

  const reqId = (await expectOk("Loja 2 pede 30 coxinhas", () =>
    createStoreRequest({ fromLocationId: "store_2", items: [{ nicheId: "cox-mini", qty: 30 }] }),
  )) as string | null;

  const factoryBeforeSteal = await stockQty("factory", "cox-mini");
  await expectOk("Envio na mão fura a reserva do pedido (furo conhecido cap. 09)", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "cox-mini", qty: Math.max(1, factoryBeforeSteal) }], sentBy: "Rita" }),
  );
  if (reqId) {
    await expectFail(
      "Atender o pedido depois do envio na mão falha ou fica sem saldo",
      () => fulfillRequest(reqId, { "cox-mini": 30 }, "Rita"),
      "estoque",
    );
    const open = await listRequests("open");
    const still = open.find((row) => row.id === reqId);
    record("Pedido da Loja 2 continua aberto depois do furo", Boolean(still), still ? still.status : "sumiu da fila");
  }

  await expectFail(
    "Consumo interno na fábrica é recusado",
    () =>
      registerInternalConsume({
        locationId: "factory",
        login: "rita.gomes",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    "fábrica não tem",
  );

  await expectFail(
    "Consumo na Loja 2 sem caixa aberto é recusado",
    () =>
      registerInternalConsume({
        locationId: "store_2",
        login: "carla.mendes",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    "abra o caixa",
  );

  await expectOk("Abrir caixa da Loja 2", () =>
    openCashSession({ locationId: "store_2", period: "manha", employeeId: "emp-carla", openingAmount: 80 }),
  );

  await expectFail(
    "Ana da Loja 1 não consome na Loja 2",
    () =>
      registerInternalConsume({
        locationId: "store_2",
        login: "ana.souza",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    "não está habilitado",
  );

  const storeStock = await stockQty("store_1", "cox-mini");
  if (storeStock > 0) {
    await expectOk("Rita (fábrica) consome 1 na Loja 1", () =>
      registerInternalConsume({
        locationId: "store_1",
        login: "rita.gomes",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    );
    await expectFail(
      "Rita não consome 2× no mesmo dia",
      () =>
        registerInternalConsume({
          locationId: "store_1",
          login: "rita.gomes",
          password: "1234",
          items: [{ nicheId: "cox-mini", qty: 1 }],
        }),
      "1 vez",
    );
  } else {
    record("Rita (fábrica) consome 1 na Loja 1", false, "loja sem saldo para consumo");
  }

  await db.products.add({
    id: "prod-pastel",
    name: "Pastel de carne",
    category: "salgado",
    perishable: true,
    shelfLifeDays: 1,
    createdAt: `${today}T10:00:00.000Z`,
  });
  await db.niches.add({
    id: "pas-local",
    productId: "prod-pastel",
    name: "Consumo local",
    sellPrice: 8,
    costPrice: 2.5,
    minStock: 12,
    minStockFactory: 24,
    minStockStore: 10,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });
  await expectOk("Produzir pastel na fábrica", () => produceItems({ madeAt: today, items: [{ nicheId: "pas-local", qty: 20 }] }));
  const pastelId = (await expectOk("Mandar pastel para a Loja 1", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "pas-local", qty: 10 }], sentBy: "Rita" }),
  )) as string | null;
  if (pastelId) {
    const pastelParts = await db.transferItems.where("transferId").equals(pastelId).toArray();
    await expectOk("Loja 1 recebe o pastel", () =>
      receiveTransfer({
        transferId: pastelId,
        receivedBy: "Ana",
        items: pastelParts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }
  await db.internalAllowances.put({ id: "pas-local", nicheId: "pas-local", enabled: true, dailyLimit: 10, personLimit: 3 });
  await db.internalAllowances.put({ id: "cox-mini", nicheId: "cox-mini", enabled: true, dailyLimit: 5, personLimit: 2 });
  await db.consumeGroups.put({
    id: "grp-salgado-local",
    name: "Salgados locais",
    enabled: true,
    personLimit: 3,
    nicheIds: ["pas-local", "cox-mini"],
  });
  await expectFail(
    "Cota de grupo recusa 2 pastel + 2 coxinha",
    () =>
      registerInternalConsume({
        locationId: "store_1",
        login: "ana.souza",
        password: "1234",
        items: [
          { nicheId: "pas-local", qty: 2 },
          { nicheId: "cox-mini", qty: 2 },
        ],
      }),
    "cota",
  );
  await expectOk("Ana leva 2 pastéis + 1 coxinha na cota", () =>
    registerInternalConsume({
      locationId: "store_1",
      login: "ana.souza",
      password: "1234",
      items: [
        { nicheId: "pas-local", qty: 2 },
        { nicheId: "cox-mini", qty: 1 },
      ],
    }),
  );
  await expectFail(
    "Quarto salgado da Ana é recusado pela cota",
    () =>
      registerInternalConsume({
        locationId: "store_1",
        login: "ana.souza",
        password: "1234",
        items: [{ nicheId: "pas-local", qty: 1 }],
      }),
    "cota",
  );

  const returnId = (await expectOk("Loja devolve 2 para a fábrica", async () => {
    const qty = Math.min(2, await stockQty("store_1", "cox-mini"));
    if (qty < 2) throw new Error("loja sem saldo para devolver 2");
    return returnToFactory({ fromLocationId: "store_1", reason: "qualidade", items: [{ nicheId: "cox-mini", qty: 2 }] });
  })) as string | null;
  if (returnId) {
    const factoryBeforeReturn = await stockQty("factory", "cox-mini");
    const parts = await db.transferItems.where("transferId").equals(returnId).toArray();
    await expectOk("Fábrica aceita 1 e descarta 1 da devolução", () =>
      receiveReturn({
        transferId: returnId,
        receivedBy: "Rita",
        items: parts.map((part, index) => ({
          id: part.id,
          acceptedQty: index === 0 ? Math.max(0, part.qty - 1) : part.qty,
        })),
      }),
    );
    const factoryAfterReturn = await stockQty("factory", "cox-mini");
    record(
      "Devolução: entra 2 e baixa 1 como perda (não é sobra)",
      factoryAfterReturn === factoryBeforeReturn + 1,
      `antes=${factoryBeforeReturn} depois=${factoryAfterReturn}`,
    );
  }

  await expectOk("Inventário lança diferença com motivo", async () => {
    const qty = await stockQty("store_1", "cox-mini");
    return applyInventory({
      locationId: "store_1",
      countedBy: "Ana Souza",
      lines: [{ nicheId: "cox-mini", countedQty: Math.max(0, qty - 1), reason: "contagem" }],
    });
  });

  await expectOk("Fechar suco", () => setProductActive("prod-suco", false));
  const liveClosed = await catalogItems(true);
  record(
    "Suco fechado some do catálogo vivo",
    !liveClosed.some((item) => item.product.id === "prod-suco"),
    liveClosed.map((item) => item.product.id).join(","),
  );
  const historyClosed = await catalogItems(false);
  record(
    "Suco fechado continua no histórico",
    historyClosed.some((item) => item.product.id === "prod-suco"),
    "",
  );
  await expectFail(
    "Compra de suco fechado é recusada",
    () =>
      receivePurchase({
        receivedAt: today,
        items: [{ nicheId: "suco-1l", qty: 2, unitCost: 4, expiresAt: addDays(today, 7) }],
      }),
    "fechado",
  );
  await expectFail(
    "Envio de suco fechado é recusado",
    () => sendToStore({ toLocationId: "store_1", items: [{ nicheId: "suco-1l", qty: 1 }], sentBy: "Rita" }),
    "fechado",
  );
  await expectFail(
    "Pedido de suco fechado é recusado",
    () => createStoreRequest({ fromLocationId: "store_1", items: [{ nicheId: "suco-1l", qty: 1 }] }),
    "fechado",
  );

  await expectOk("Fechar coxinha com saldo", () => setProductActive("prod-coxinha", false));
  const factorySheet = await inventorySheet("factory");
  record(
    "Inventário ainda vê coxinha fechada com saldo",
    factorySheet.some((row) => row.nicheId === "cox-mini"),
    factorySheet.map((row) => row.nicheId).join(","),
  );
  await expectFail(
    "Produzir coxinha fechada é recusada",
    () => produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 10 }] }),
    "fechado",
  );
  await expectFail(
    "Venda de coxinha fechada é recusada",
    () => checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 1 }] }),
    "fechado",
  );
  await expectOk("Reativar coxinha", () => setProductActive("prod-coxinha", true));
  const liveOpen = await catalogItems(true);
  record(
    "Coxinha reativada volta ao catálogo vivo",
    liveOpen.some((item) => item.product.id === "prod-coxinha"),
    "",
  );

  await expectOk("Pacote do dia gera folha", async () => {
    const pack = await reportDayPack(reportWindow("today"), "store_1");
    if (!pack.rows.length) throw new Error("folha vazia");
    return `${pack.title} · ${pack.rows.length} linhas`;
  });

  await expectFail("Dois caixas do mesmo período no mesmo dia", async () => {
    const open = await currentCashSession("store_1");
    if (open) {
      const ledger = await sessionLedger(open.id);
      await closeCashSession({ sessionId: open.id, closingAmount: ledger.expectedCash });
    }
    await openCashSession({ locationId: "store_1", period: "manha", employeeId: "emp-ana", openingAmount: 100 });
  }, "já foi usado");

  const passed = rows.filter((row) => row.pass).length;
  const failed = rows.filter((row) => !row.pass).length;
  console.log("\n--- RESUMO ---");
  console.log(JSON.stringify({ passed, failed, total: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
