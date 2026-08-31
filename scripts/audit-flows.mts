import { indexedDB, IDBKeyRange } from "fake-indexeddb";

Object.assign(globalThis, { indexedDB, IDBKeyRange });
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value));
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
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
  const { DEFAULT_EMPLOYEES, DEMO_AS_OF_SETTING, ensureDemoData, loadDemoData } = await import("../src/lib/seed.ts");
  const { personAllowedPanelIds, personCanUsePanel, personHomePanelId } = await import("../src/lib/people.ts");
  const { enterOperator, switchOperatorPanel, verifyOperatorPin } = await import("../src/lib/operator.ts");
  const { getActorId, getLocationId, clearOperatorSession } = await import("../src/lib/session.ts");
  const { todayDate, addDays, startOfDayIso, endOfDayIso, parseMoney, formatBRL } = await import("../src/lib/money.ts");
  const { stockQty, changeStock } = await import("../src/lib/stock-core.ts");
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
    withdrawProductAndCash,
  } = await import("../src/lib/stock.ts");
  const { openCashSession, registerCashMovement, closeCashSession, reopenCashSession, currentCashSession, sessionLedger } =
    await import("../src/lib/cash.ts");
  const { createStoreRequest, fulfillRequest, listRequests, cancelRequest, factoryFreeByNiche, factoryStockPosition } = await import("../src/lib/requests.ts");
  const { registerInternalConsume } = await import("../src/lib/consume.ts");
  const { reportDayPack, reportRomaneio, reportWindow, reportClosing, reportFactoryClients } = await import("../src/lib/reports.ts");
  const { catalogItems, inventorySheet, setProductActive, loadKardex, loadDashboard, listProductionLogs } = await import("../src/lib/queries.ts");
  const { saleCategories } = await import("../src/lib/categories.ts");
  const { saveCombo } = await import("../src/lib/combos.ts");
  const { listCustomers, saveCustomer, ensurePortfolioAlerts } = await import("../src/lib/customers.ts");
  const { createFactoryOrder, listFactoryOrders, deliverFactoryOrder, lastFactoryOrder, cancelFactoryOrder } =
    await import("../src/lib/factory-orders.ts");
  const { customerKind, isRevenueSale } = await import("../src/lib/types.ts");
  const { takeEncomendaSignal, deliverEncomenda, listOpenParties, quoteEncomendaDelivery } = await import("../src/lib/encomendas.ts");
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

  const telma = DEFAULT_EMPLOYEES.find((person) => person.id === "emp-telma");
  const yokota = DEFAULT_EMPLOYEES.find((person) => person.id === "emp-yokota");
  const matheus = DEFAULT_EMPLOYEES.find((person) => person.id === "emp-matheus");
  const brendao = DEFAULT_EMPLOYEES.find((person) => person.id === "emp-brendao");
  record(
    "Telma não entra na administração",
    Boolean(telma && !personCanUsePanel(telma, "admin") && personHomePanelId(telma) === "store_1"),
    telma ? personAllowedPanelIds(telma).join(",") : "sem ficha",
  );
  record(
    "Yokota cobre todos os painéis",
    Boolean(
      yokota &&
        personCanUsePanel(yokota, "admin") &&
        personCanUsePanel(yokota, "factory") &&
        personCanUsePanel(yokota, "store_1") &&
        personCanUsePanel(yokota, "store_2"),
    ),
    yokota ? personAllowedPanelIds(yokota).join(",") : "sem ficha",
  );
  record(
    "Matheus cobre todos os painéis",
    Boolean(
      matheus &&
        personCanUsePanel(matheus, "admin") &&
        personCanUsePanel(matheus, "factory") &&
        personCanUsePanel(matheus, "store_1") &&
        personCanUsePanel(matheus, "store_2"),
    ),
    matheus ? personAllowedPanelIds(matheus).join(",") : "sem ficha",
  );
  record(
    "Brendão só a fábrica",
    Boolean(brendao && personAllowedPanelIds(brendao).join(",") === "factory"),
    brendao ? personAllowedPanelIds(brendao).join(",") : "sem ficha",
  );
  await expectFail("PIN errado da Telma é recusado", () => verifyOperatorPin("emp-telma", "0000"), "não confere");
  const telmaOk = (await expectOk("PIN da Telma confere", () => verifyOperatorPin("emp-telma", "1234"))) as
    | typeof telma
    | null;
  if (telmaOk) {
    enterOperator(telmaOk, "admin");
    record(
      "Telma cai no Centro mesmo pedindo admin",
      getActorId() === "emp-telma" && getLocationId() === "store_1",
      `actor=${getActorId()} lugar=${getLocationId()}`,
    );
    await expectFail("Telma não troca para a fábrica", async () => switchOperatorPanel(telmaOk, "factory"), "não é de");
  }
  if (matheus) {
    enterOperator(matheus);
    record("Matheus entra na administração", getLocationId() === "admin", `lugar=${getLocationId()}`);
    switchOperatorPanel(matheus, "factory");
    record("Matheus vai à fábrica", getLocationId() === "factory", `lugar=${getLocationId()}`);
    switchOperatorPanel(matheus, "store_1");
    record("Matheus vai ao Centro", getLocationId() === "store_1", `lugar=${getLocationId()}`);
  }
  if (yokota) {
    enterOperator(yokota);
    record("Yokota entra na administração", getLocationId() === "admin", `lugar=${getLocationId()}`);
    switchOperatorPanel(yokota, "factory");
    record("Yokota vai à fábrica", getLocationId() === "factory", `lugar=${getLocationId()}`);
    switchOperatorPanel(yokota, "store_2");
    record("Yokota vai ao Jardim", getLocationId() === "store_2", `lugar=${getLocationId()}`);
  }
  if (brendao) {
    enterOperator(brendao);
    record("Brendão entra na fábrica", getLocationId() === "factory", `lugar=${getLocationId()}`);
    await expectFail("Brendão não troca para a administração", async () => switchOperatorPanel(brendao, "admin"), "não é de");
  }

  await expectFail(
    "Sem quem opera não produz",
    async () => {
      clearOperatorSession();
      await produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 1 }] });
    },
    "operando",
  );
  if (yokota) enterOperator(yokota);

  await expectFail("Produzir bebida é recusado", () => produceItems({ madeAt: today, items: [{ nicheId: "coca-350", qty: 10 }] }), "não se produz");
  await expectFail("Comprar salgado é recusado", () => receivePurchase({ receivedAt: today, items: [{ nicheId: "cox-mini", qty: 10, unitCost: 0.4 }] }), "fabricado");
  await expectOk("Produzir coxinha na fábrica", () => produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 100 }] }));
  const prodMove = (await db.movements.where("type").equals("production").toArray())[0];
  record(
    "Produção grava quem operou",
    Boolean(prodMove?.actorId) && prodMove?.actorId === getActorId(),
    `actor=${prodMove?.actorId}`,
  );
  await expectOk("Comprar Coca na fábrica", () => receivePurchase({ receivedAt: today, items: [{ nicheId: "coca-350", qty: 40, unitCost: 3.1 }] }));
  const coxLot = (await db.lots.where("nicheId").equals("cox-mini").toArray())[0];
  const cocaLot = (await db.lots.where("nicheId").equals("coca-350").toArray())[0];
  record("Produção grava preço de venda no lote", coxLot?.unitPrice === 1.5, `preço=${coxLot?.unitPrice}`);
  record("Compra grava preço de venda no lote", cocaLot?.unitPrice === 6, `preço=${cocaLot?.unitPrice}`);

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
    openCashSession({ locationId: "store_1", period: "manha", employeeId: "emp-telma", openingAmount: 150 }),
  )) as { id: string } | null;

  await expectFail(
    "Telma não abre o caixa da Loja 2",
    () => openCashSession({ locationId: "store_2", period: "manha", employeeId: "emp-telma", openingAmount: 80 }),
    "não abre",
  );
  await expectFail(
    "Matheus não abre o caixa da loja",
    () => openCashSession({ locationId: "store_2", period: "manha", employeeId: "emp-matheus", openingAmount: 80 }),
    "não abre",
  );

  if (matheus) {
    enterOperator(matheus);
    switchOperatorPanel(matheus, "store_1");
    await expectFail(
      "Matheus não abre caixa no nome da Telma",
      () => openCashSession({ locationId: "store_1", period: "tarde", employeeId: "emp-telma", openingAmount: 150 }),
      "não opera",
    );
    await expectFail(
      "Matheus não vende no Centro",
      () => checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 1 }] }),
      "não opera",
    );
    if (session?.id) {
      await expectFail(
        "Matheus não sangra",
        () =>
          registerCashMovement({
            sessionId: session.id,
            type: "sangria",
            amount: 10,
            reason: "teste dono",
            destination: "cofre",
          }),
        "não opera",
      );
      await expectFail(
        "Matheus não fecha caixa",
        () => closeCashSession({ sessionId: session.id, closingAmount: 150 }),
        "não opera",
      );
      await expectFail(
        "Matheus não retira produto+dinheiro",
        () =>
          withdrawProductAndCash({
            locationId: "store_1",
            nicheId: "cox-mini",
            qty: 1,
            amount: 5,
            reason: "teste dono",
            destination: "cofre",
          }),
        "não opera",
      );
    }
    switchOperatorPanel(matheus, "admin");
    await expectOk("Matheus continua na administração", async () => getLocationId() === "admin");
  }
  if (yokota) enterOperator(yokota);

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

  await db.products.add({
    id: "prod-detergente",
    name: "Detergente neutro",
    category: "limpeza",
    perishable: false,
    shelfLifeDays: 0,
    createdAt: `${today}T10:00:00.000Z`,
  });
  await db.niches.add({
    id: "det-5l",
    productId: "prod-detergente",
    name: "Galão 5L",
    sellPrice: 18,
    costPrice: 9,
    minStock: 2,
    minStockFactory: 8,
    minStockStore: 2,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });
  const saleChips = saleCategories().map((item) => item.id);
  record(
    "Chips da venda são só salgado e bebida",
    saleChips.join(",") === "salgado,bebida",
    saleChips.join(","),
  );
  await expectFail(
    "Venda de detergente no caixa é recusada",
    () =>
      checkout({
        locationId: "store_1",
        channel: "caixa",
        payment: "dinheiro",
        items: [{ nicheId: "det-5l", qty: 1 }],
      }),
    "uso da loja",
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
    const paper = await reportRomaneio(transferId);
    record(
      "Romaneio lê a ficha, não Rita nem Fábrica",
      paper.subtitle.includes("Expedido por Yokota") &&
        paper.subtitle.includes("Conferido por Yokota") &&
        !paper.subtitle.includes("Rita") &&
        !paper.subtitle.includes("Ana") &&
        !paper.subtitle.includes("Expedido por Fábrica"),
      paper.subtitle,
    );
  }

  const afterReceive = await stockQty("store_1", "cox-mini");
  record("Depois de conferir, a loja tem 40", afterReceive === 40, `qty=${afterReceive}`);

  const saleId = (await expectOk("Venda em dinheiro", () =>
    checkout({ locationId: "store_1", channel: "caixa", payment: "dinheiro", items: [{ nicheId: "cox-mini", qty: 10 }] }),
  )) as string | null;
  if (saleId) {
    const sale = await db.sales.get(saleId);
    record("Venda grava quem operou", sale?.actorId === getActorId(), `actor=${sale?.actorId}`);
  }

  await db.niches.add({
    id: "cox-festa",
    productId: "prod-coxinha",
    name: "Festa",
    sellPrice: 2,
    costPrice: 0.55,
    minStock: 20,
    minStockFactory: 40,
    minStockStore: 18,
    active: true,
    promoAllowed: false,
    promoPrice: 0,
  });

  await expectOk("Produzir coxinha festa para o preço no lote", () =>
    produceItems({ madeAt: today, items: [{ nicheId: "cox-festa", qty: 12 }] }),
  );
  const festaSendId = (await expectOk("Mandar coxinha festa para testar o preço do lote", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "cox-festa", qty: 8 }], sentBy: "Rita" }),
  )) as string | null;
  if (festaSendId) {
    const festaParts = await db.transferItems.where("transferId").equals(festaSendId).toArray();
    await expectOk("Loja confere a coxinha festa do preço no lote", () =>
      receiveTransfer({
        transferId: festaSendId,
        receivedBy: "Ana",
        items: festaParts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }
  await db.niches.update("cox-festa", { sellPrice: 9 });
  await expectFail(
    "Coxinha Festa não vende no balcão",
    () => checkout({ locationId: "store_1", channel: "caixa", payment: "pix", items: [{ nicheId: "cox-festa", qty: 1 }] }),
    "festa",
  );
  const pricedId = (await expectOk("Encomenda cobra o preço do lote, não o tipo novo", () =>
    checkout({ locationId: "store_1", channel: "encomenda", payment: "pix", items: [{ nicheId: "cox-festa", qty: 1 }] }),
  )) as string | null;
  if (pricedId) {
    const pricedItems = await db.saleItems.where("saleId").equals(pricedId).toArray();
    record(
      "Cupom cobrou o preço do lote, não o tipo novo",
      pricedItems.length > 0 && pricedItems.every((item) => item.unitPrice === 2),
      pricedItems.map((item) => item.unitPrice).join(","),
    );
  }

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
        }),
      "bater",
    );
    await expectFail(
      "Quebra sem testemunha é recusada",
      () =>
        closeCashSession({
          sessionId: session.id,
          closingAmount: ledger.expectedCash + 10,
          secondCount: ledger.expectedCash + 10,
        }),
      "outra pessoa",
    );
    await expectFail(
      "Quem opera não confere o próprio caixa",
      () =>
        closeCashSession({
          sessionId: session.id,
          closingAmount: ledger.expectedCash + 10,
          secondCount: ledger.expectedCash + 10,
          recountedById: getActorId() ?? "emp-yokota",
          witnessPin: "1234",
        }),
      "próprio",
    );
    await expectFail(
      "PIN da testemunha do caixa errado é recusado",
      () =>
        closeCashSession({
          sessionId: session.id,
          closingAmount: ledger.expectedCash + 10,
          secondCount: ledger.expectedCash + 10,
          recountedById: "emp-telma",
          witnessPin: "0000",
        }),
      "não confere",
    );
    await expectOk("Fechar caixa com 2ª contagem e testemunha", () =>
      closeCashSession({
        sessionId: session.id,
        closingAmount: ledger.expectedCash + 10,
        secondCount: ledger.expectedCash + 10,
        recountedById: "emp-telma",
        witnessPin: "1234",
        note: "Faltou troco no fundo",
      }),
    );
    const closedSession = await db.cashSessions.get(session.id);
    record(
      "Fechamento grava a ficha de quem conferiu",
      closedSession?.recountedById === "emp-telma" && closedSession?.recountedBy === "Telma",
      `id=${closedSession?.recountedById} nome=${closedSession?.recountedBy}`,
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
  const leftoverBeforeSteal = (await factoryFreeByNiche()).get("cox-mini") ?? 0;
  record(
    "Pedido da Loja 2 reserva o poço na câmara",
    leftoverBeforeSteal < factoryBeforeSteal,
    `fábrica=${factoryBeforeSteal} livres=${leftoverBeforeSteal}`,
  );
  await expectFail(
    "Envio na mão não fura a reserva do pedido",
    () =>
      sendToStore({
        toLocationId: "store_1",
        items: [{ nicheId: "cox-mini", qty: Math.max(1, factoryBeforeSteal) }],
        sentBy: "Rita",
      }),
    "pedido",
  );
  if (leftoverBeforeSteal > 0) {
    await expectOk("Envio na mão manda só o que sobrou da fila", () =>
      sendToStore({
        toLocationId: "store_1",
        items: [{ nicheId: "cox-mini", qty: leftoverBeforeSteal }],
        sentBy: "Rita",
      }),
    );
  }
  if (reqId) {
    await expectOk("Atender o pedido da Loja 2 usa a reserva", () =>
      fulfillRequest(reqId, { "cox-mini": 30 }, "Rita"),
    );
    const open = await listRequests("open");
    const still = open.find((row) => row.id === reqId);
    record("Pedido da Loja 2 sai da fila depois de mandar a reserva", !still, still ? still.status : "saiu");
  }

  await expectFail(
    "Consumo interno na fábrica é recusado",
    () =>
      registerInternalConsume({
        locationId: "factory",
        login: "brendao",
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
        login: "yokota",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    "abra o caixa",
  );

  await expectOk("Abrir caixa da Loja 2", () =>
    openCashSession({ locationId: "store_2", period: "manha", employeeId: "emp-yokota", openingAmount: 80 }),
  );

  await expectFail(
    "Telma da Loja 1 não consome na Loja 2",
    () =>
      registerInternalConsume({
        locationId: "store_2",
        login: "telma",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    "não está habilitado",
  );

  const storeStock = await stockQty("store_1", "cox-mini");
  if (storeStock > 0) {
    await expectOk("Brendão (fábrica) consome 1 na Loja 1", () =>
      registerInternalConsume({
        locationId: "store_1",
        login: "brendao",
        password: "1234",
        items: [{ nicheId: "cox-mini", qty: 1 }],
      }),
    );
    await expectFail(
      "Brendão não consome 2× no mesmo dia",
      () =>
        registerInternalConsume({
          locationId: "store_1",
          login: "brendao",
          password: "1234",
          items: [{ nicheId: "cox-mini", qty: 1 }],
        }),
      "1 vez",
    );
  } else {
    record("Brendão (fábrica) consome 1 na Loja 1", false, "loja sem saldo para consumo");
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
        login: "telma",
        password: "1234",
        items: [
          { nicheId: "pas-local", qty: 2 },
          { nicheId: "cox-mini", qty: 2 },
        ],
      }),
    "cota",
  );
  await expectOk("Telma leva 2 pastéis + 1 coxinha na cota", () =>
    registerInternalConsume({
      locationId: "store_1",
      login: "telma",
      password: "1234",
      items: [
        { nicheId: "pas-local", qty: 2 },
        { nicheId: "cox-mini", qty: 1 },
      ],
    }),
  );
  await expectFail(
    "Quarto salgado da Telma é recusado pela cota",
    () =>
      registerInternalConsume({
        locationId: "store_1",
        login: "telma",
        password: "1234",
        items: [{ nicheId: "pas-local", qty: 1 }],
      }),
    "cota",
  );

  const comboId = (await expectOk("Admin monta combo 10 mini + Coca", () =>
    saveCombo({
      name: "10 mini + Coca",
      price: 18,
      enabled: true,
      promoFrom: `${today}T00:00:00.000Z`,
      promoTo: `${addDays(today, 14)}T23:59:59.999Z`,
      items: [
        { nicheId: "cox-mini", qty: 10 },
        { nicheId: "coca-350", qty: 1 },
      ],
    }),
  )) as string | null;

  await expectFail(
    "Combo sem Coca na Loja 1 é recusado inteiro",
    () =>
      checkout({
        locationId: "store_1",
        channel: "caixa",
        payment: "dinheiro",
        combos: [{ comboId: comboId ?? "combo-ausente", qty: 1 }],
      }),
    "não fecha",
  );

  const comboCocaSend = (await expectOk("Mandar Coca para a Loja 1 vender o combo", () =>
    sendToStore({ toLocationId: "store_1", items: [{ nicheId: "coca-350", qty: 5 }], sentBy: "Rita" }),
  )) as string | null;
  if (comboCocaSend) {
    const comboCocaParts = await db.transferItems.where("transferId").equals(comboCocaSend).toArray();
    await expectOk("Loja 1 recebe a Coca do combo", () =>
      receiveTransfer({
        transferId: comboCocaSend,
        receivedBy: "Ana",
        items: comboCocaParts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }

  const coxBeforeCombo = await stockQty("store_1", "cox-mini");
  const cocaBeforeCombo = await stockQty("store_1", "coca-350");
  const comboSaleId = comboId
    ? ((await expectOk("Ana vende 1 combo", () =>
        checkout({
          locationId: "store_1",
          channel: "caixa",
          payment: "dinheiro",
          combos: [{ comboId, qty: 1 }],
        }),
      )) as string | null)
    : null;
  if (comboSaleId) {
    const comboSale = await db.sales.get(comboSaleId);
    const coxAfterCombo = await stockQty("store_1", "cox-mini");
    const cocaAfterCombo = await stockQty("store_1", "coca-350");
    record("Combo cobra o preço do pacote (18)", comboSale?.total === 18, `total=${comboSale?.total}`);
    record(
      "Combo baixa 10 coxinha e 1 Coca",
      coxAfterCombo === coxBeforeCombo - 10 && cocaAfterCombo === cocaBeforeCombo - 1,
      `cox ${coxBeforeCombo}→${coxAfterCombo} coca ${cocaBeforeCombo}→${cocaAfterCombo}`,
    );
  } else {
    record("Combo cobra o preço do pacote (18)", false, "venda do combo não gravou");
    record("Combo baixa 10 coxinha e 1 Coca", false, "venda do combo não gravou");
  }

  if (comboId) {
    await db.combos.update(comboId, { promoTo: `${addDays(today, -1)}T23:59:59.999Z` });
    await expectFail(
      "Combo fora da vigência é recusado",
      () =>
        checkout({
          locationId: "store_1",
          channel: "caixa",
          payment: "dinheiro",
          combos: [{ comboId, qty: 1 }],
        }),
      "acabou",
    );
  }

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
      lines: [{ nicheId: "cox-mini", countedQty: Math.max(0, qty - 1), reason: "contagem" }],
    });
  });

  const qtyRecount = await stockQty("store_1", "cox-mini");
  const countedBig = Math.max(0, qtyRecount - 10);
  await expectFail(
    "Inventário com diferença grande sem 2ª contagem é recusado",
    () =>
      applyInventory({
        locationId: "store_1",
        lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
      }),
    "conte de novo",
  );
  await expectFail(
    "Inventário com 2ª contagem diferente da primeira é recusado",
    () =>
      applyInventory({
        locationId: "store_1",
        secondCounts: [{ nicheId: "cox-mini", countedQty: qtyRecount }],
        lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
      }),
    "bater",
  );
  await expectFail(
    "Inventário grande sem testemunha é recusado",
    () =>
      applyInventory({
        locationId: "store_1",
        secondCounts: [{ nicheId: "cox-mini", countedQty: countedBig }],
        lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
      }),
    "outra pessoa",
  );
  await expectFail(
    "Quem opera não confere o próprio inventário",
    () =>
      applyInventory({
        locationId: "store_1",
        recountedById: getActorId() ?? "emp-yokota",
        witnessPin: "1234",
        secondCounts: [{ nicheId: "cox-mini", countedQty: countedBig }],
        lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
      }),
    "próprio",
  );
  await expectFail(
    "PIN da testemunha do inventário errado é recusado",
    () =>
      applyInventory({
        locationId: "store_1",
        recountedById: "emp-telma",
        witnessPin: "0000",
        secondCounts: [{ nicheId: "cox-mini", countedQty: countedBig }],
        lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
      }),
    "não confere",
  );
  await expectOk("Inventário com diferença grande e testemunha", () =>
    applyInventory({
      locationId: "store_1",
      recountedById: "emp-telma",
      witnessPin: "1234",
      secondCounts: [{ nicheId: "cox-mini", countedQty: countedBig }],
      lines: [{ nicheId: "cox-mini", countedQty: countedBig, reason: "contagem" }],
    }),
  );
  const inventoryCount = (await db.inventoryCounts.toArray()).sort((a, b) => b.at.localeCompare(a.at))[0];
  record(
    "Inventário grava a ficha de quem conferiu",
    inventoryCount?.recountedById === "emp-telma" && inventoryCount?.recountedBy === "Telma",
    `id=${inventoryCount?.recountedById} nome=${inventoryCount?.recountedBy}`,
  );

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
    const text = pack.rows.map((row) => row.join(" ")).join(" | ");
    if (!text.includes("Yokota") || !text.includes("Telma")) {
      throw new Error(`folha sem ficha: ${text}`);
    }
    return `${pack.title} · ${pack.rows.length} linhas`;
  });

  await expectFail("Dois caixas do mesmo período no mesmo dia", async () => {
    const open = await currentCashSession("store_1");
    if (open) {
      const ledger = await sessionLedger(open.id);
      await closeCashSession({ sessionId: open.id, closingAmount: ledger.expectedCash });
    }
    await openCashSession({ locationId: "store_1", period: "manha", employeeId: "emp-telma", openingAmount: 100 });
  }, "já foi usado");

  await expectFail(
    "Cliente sem nome é recusado",
    () => saveCustomer({ name: "   ", note: "festa" }),
    "nome",
  );
  await expectOk("Rita cadastra Dona Márcia", () =>
    saveCustomer({
      name: "Dona Márcia",
      phone: "(11) 98888-1010",
      note: "festa sábado",
    }),
  );
  const found = await listCustomers("márcia");
  record(
    "Rita acha Dona Márcia na lista",
    found.some((row) => row.name === "Dona Márcia" && row.note.toLowerCase().includes("festa")),
    found.map((row) => row.name).join(","),
  );
  record(
    "Dona Márcia é festa, não compra na fábrica",
    found.some((row) => row.name === "Dona Márcia" && customerKind(row) === "festa"),
    found.map((row) => `${row.name}:${customerKind(row)}`).join(","),
  );

  await db.customers.add({
    id: "cust-old-sem-kind",
    name: "Seu João",
    phone: "",
    note: "cadastro antigo",
    address: "",
    active: true,
    createdAt: `${today}T10:00:00.000Z`,
  });
  record(
    "Cliente antigo sem tipo conta como festa",
    customerKind(await db.customers.get("cust-old-sem-kind")) === "festa",
    "",
  );

  const factoryBeforeKind = await stockQty("factory", "cox-mini");
  const storeBeforeKind = await stockQty("store_1", "cox-mini");
  await expectOk("Rita marca Padaria do Zé como compra na fábrica", () =>
    saveCustomer({
      name: "Padaria do Zé",
      phone: "(11) 97777-2020",
      note: "compra grande",
      kind: "volume",
    }),
  );
  const bakeries = await listCustomers("padaria", "volume");
  record(
    "Padaria do Zé aparece em Compra na fábrica",
    bakeries.some((row) => row.name === "Padaria do Zé" && customerKind(row) === "volume"),
    bakeries.map((row) => `${row.name}:${customerKind(row)}`).join(","),
  );
  const festaOnly = await listCustomers("", "festa");
  record(
    "Filtro festa esconde a padaria",
    !festaOnly.some((row) => row.name === "Padaria do Zé") && festaOnly.some((row) => row.name === "Dona Márcia"),
    festaOnly.map((row) => row.name).join(","),
  );
  const carlosId = (await saveCustomer({
    name: "Bar do Carlos",
    note: "festa",
    kind: "festa",
  })) as string;
  await saveCustomer({ id: carlosId, name: "Bar do Carlos", kind: "volume" });
  const carlos = await listCustomers("carlos");
  record(
    "Rita muda festa para compra na fábrica",
    carlos.some((row) => row.id === carlosId && customerKind(row) === "volume"),
    carlos.map((row) => `${row.name}:${customerKind(row)}`).join(","),
  );
  const factoryAfterKind = await stockQty("factory", "cox-mini");
  const storeAfterKind = await stockQty("store_1", "cox-mini");
  record(
    "Marcar o tipo do cliente não baixa estoque",
    factoryAfterKind === factoryBeforeKind && storeAfterKind === storeBeforeKind,
    `fábrica ${factoryBeforeKind}→${factoryAfterKind} loja ${storeBeforeKind}→${storeAfterKind}`,
  );

  const marcia = found.find((row) => row.name === "Dona Márcia");
  await expectFail(
    "Festa não monta pedido da câmara",
    () => createFactoryOrder({ customerId: marcia?.id ?? "x", items: [{ nicheId: "cox-mini", qty: 10 }] }),
    "compra na fábrica",
  );
  const padaria = bakeries.find((row) => row.name === "Padaria do Zé");
  await expectFail(
    "Insumo não entra no pedido da câmara",
    () => createFactoryOrder({ customerId: padaria?.id ?? "x", items: [{ nicheId: "farinha-25kg", qty: 1 }] }),
    "não sai da câmara",
  );
  await expectFail(
    "Bebida não entra no pedido da câmara",
    () => createFactoryOrder({ customerId: padaria?.id ?? "x", items: [{ nicheId: "coca-350", qty: 10 }] }),
    "só salgado",
  );

  for (const row of await listRequests("open")) {
    if (row.items.some((item) => item.nicheId === "cox-mini" && item.remaining > 0)) {
      await cancelRequest(row.id);
    }
  }
  const have = await stockQty("factory", "cox-mini");
  if (have < 100) {
    await expectOk("Produzir para o poço da câmara ter 100", () =>
      produceItems({ madeAt: today, items: [{ nicheId: "cox-mini", qty: 100 - have }] }),
    );
  }
  const wellStock = await stockQty("factory", "cox-mini");
  record("Câmara tem 100 coxinhas para o poço", wellStock === 100, `qty=${wellStock}`);

  await expectOk("Loja pede 80 coxinhas no poço", () =>
    createStoreRequest({ fromLocationId: "store_1", items: [{ nicheId: "cox-mini", qty: 80 }] }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  await expectOk("Padaria pede 50 na câmara", () =>
    createFactoryOrder({ customerId: padaria?.id ?? "x", items: [{ nicheId: "cox-mini", qty: 50 }] }),
  );

  const storeWell = (await listRequests("open")).find(
    (row) => row.fromLocationId === "store_1" && row.items.some((item) => item.nicheId === "cox-mini" && item.qty === 80),
  );
  const customerWell = (await listFactoryOrders("open")).find((row) => row.customerId === padaria?.id);
  const storeLine = storeWell?.items.find((item) => item.nicheId === "cox-mini");
  const customerLine = customerWell?.items.find((item) => item.nicheId === "cox-mini");
  record(
    "Pedido mais antigo da loja fica inteiro no poço",
    storeWell?.status === "pending" && storeLine?.availableQty === 80,
    `${storeWell?.statusLabel ?? "sumiu"} · reserva ${storeLine?.availableQty}`,
  );
  record(
    "Pedido da padaria fica parcial no poço",
    customerWell?.status === "parcial" && customerLine?.availableQty === 20,
    `${customerWell?.statusLabel ?? "sumiu"} · reserva ${customerLine?.availableQty}`,
  );
  const wellAfter = await stockQty("factory", "cox-mini");
  const storeAfterWell = await stockQty("store_1", "cox-mini");
  record(
    "Reservar o poço não baixa estoque",
    wellAfter === 100 && storeAfterWell === storeAfterKind,
    `fábrica ${wellStock}→${wellAfter} loja ${storeAfterKind}→${storeAfterWell}`,
  );

  const orderId = customerWell?.id;
  const store1BeforeDeliver = await stockQty("store_1", "cox-mini");
  const store2BeforeDeliver = await stockQty("store_2", "cox-mini");
  const cashBefore = await currentCashSession("store_2");
  const ledgerBefore = cashBefore ? await sessionLedger(cashBefore.id) : null;
  const salesBefore = await db.sales.count();
  const transfersBefore = await db.transfers.count();

  await expectFail(
    "Não leva mais do que a fila reserva",
    () => deliverFactoryOrder(orderId ?? "x", { "cox-mini": 50 }, { method: "pix" }),
    "livres",
  );
  await expectFail(
    "Cliente levou pede como pagou",
    () => deliverFactoryOrder(orderId ?? "x", { "cox-mini": 20 }),
    "pagou",
  );
  await expectOk("Padaria leva as 20 livres da câmara", () =>
    deliverFactoryOrder(orderId ?? "x", { "cox-mini": 20 }, { method: "pix" }),
  );

  const factoryAfterDeliver = await stockQty("factory", "cox-mini");
  const store1AfterDeliver = await stockQty("store_1", "cox-mini");
  const store2AfterDeliver = await stockQty("store_2", "cox-mini");
  record(
    "Câmara desce e a loja não ganha estoque",
    factoryAfterDeliver === 80 && store1AfterDeliver === store1BeforeDeliver && store2AfterDeliver === store2BeforeDeliver,
    `fábrica ${wellAfter}→${factoryAfterDeliver} centro ${store1BeforeDeliver}→${store1AfterDeliver} jardim ${store2BeforeDeliver}→${store2AfterDeliver}`,
  );

  const cashAfter = await currentCashSession("store_2");
  const ledgerAfter = cashAfter ? await sessionLedger(cashAfter.id) : null;
  record(
    "Caixa da loja não mexe na entrega da câmara",
    Boolean(ledgerBefore) && ledgerBefore?.expectedCash === ledgerAfter?.expectedCash && (await db.sales.count()) === salesBefore,
    `esperado ${ledgerBefore?.expectedCash}→${ledgerAfter?.expectedCash} vendas ${salesBefore}→${await db.sales.count()}`,
  );
  record(
    "Entrega da câmara não vira envio nem venda",
    (await db.transfers.count()) === transfersBefore &&
      (await db.movements.where("type").equals("cliente").count()) > 0 &&
      (await db.movements.filter((row) => row.refId === orderId && row.type === "sale").count()) === 0,
    "",
  );

  const afterDeliver = (await listFactoryOrders()).find((row) => row.id === orderId);
  const afterLine = afterDeliver?.items.find((item) => item.nicheId === "cox-mini");
  record(
    "O que faltou no pedido da padaria fica explícito",
    afterDeliver?.status === "sem_saldo" && afterLine?.remaining === 30 && afterLine.availableQty === 0 && afterLine.sentQty === 20,
    `${afterDeliver?.statusLabel ?? "sumiu"} · restam ${afterLine?.remaining} · livres ${afterLine?.availableQty}`,
  );
  const padariaOrderRow = orderId ? await db.factoryOrders.get(orderId) : undefined;
  record(
    "sem_saldo da padaria persiste no banco",
    padariaOrderRow?.status === "sem_saldo",
    `db=${padariaOrderRow?.status}`,
  );

  const storeStill = (await listRequests("open")).find((row) => row.id === storeWell?.id);
  record(
    "Pedido da loja mais antiga continua com a reserva",
    storeStill?.items.find((item) => item.nicheId === "cox-mini")?.availableQty === 80,
    `${storeStill?.statusLabel ?? "sumiu"} · ${storeStill?.items.find((item) => item.nicheId === "cox-mini")?.availableQty}`,
  );

  const kardexFactory = await loadKardex({
    nicheId: "cox-mini",
    locationId: "factory",
    from: startOfDayIso(today),
    to: endOfDayIso(today),
  });
  const kardexCliente = kardexFactory.rows.filter((row) => row.type === "cliente");
  const clienteQty = kardexCliente.reduce((sum, row) => sum + row.qty, 0);
  record(
    "Extrato da fábrica diz Cliente e o nome da padaria",
    kardexCliente.some((row) => row.typeLabel.includes("Padaria")) && Math.abs(clienteQty) === 20,
    kardexCliente.length
      ? `${kardexCliente.map((row) => `${row.typeLabel} · ${row.qty}`).join(" + ")}`
      : "sumiu",
  );

  const storePackAfterCliente = await reportDayPack(reportWindow("today"), "store_1");
  const storeSales = (await db.sales.toArray()).filter((sale) => sale.locationId === "store_1" && !sale.voidedAt);
  const storeSoldQty = (
    await Promise.all(storeSales.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  )
    .flat()
    .reduce((sum, item) => sum + item.qty, 0);
  const storeSoldRow = storePackAfterCliente.rows.find((row) => row[1] === "Vendeu");
  const storeSoldPack = Number(String(storeSoldRow?.[2] ?? "").match(/(\d+) un/)?.[1] ?? -1);
  record(
    "Folha da loja não conta a saída da câmara",
    storeSoldPack === storeSoldQty && !storePackAfterCliente.rows.some((row) => row[1] === "Cliente"),
    `vendeu ${storeSoldPack} (caixa ${storeSoldQty}) · cliente ${storePackAfterCliente.rows.some((row) => row[1] === "Cliente") ? "entrou" : "fora"}`,
  );

  const factoryPackAfterCliente = await reportDayPack(reportWindow("today"), "factory");
  const allPackAfterCliente = await reportDayPack(reportWindow("today"), "all");
  record(
    "Folha da fábrica e da rede mostram Cliente",
    factoryPackAfterCliente.rows.some((row) => row[1] === "Cliente" && String(row[2]).includes("20")) &&
      allPackAfterCliente.rows.some((row) => row[1] === "Cliente" && String(row[2]).includes("20")),
    `fábrica ${factoryPackAfterCliente.rows.find((row) => row[1] === "Cliente")?.[2] ?? "sumiu"} · rede ${allPackAfterCliente.rows.find((row) => row[1] === "Cliente")?.[2] ?? "sumiu"}`,
  );

  const lastPadaria = await lastFactoryOrder(padaria?.id ?? "x");
  record(
    "Repetir o último copia as 50 da padaria",
    lastPadaria?.some((item) => item.nicheId === "cox-mini" && item.qty === 50) === true,
    JSON.stringify(lastPadaria),
  );
  await expectOk("Padaria pede de novo o último", () =>
    createFactoryOrder({ customerId: padaria?.id ?? "x", items: lastPadaria ?? [] }),
  );
  const repeatWell = (await listFactoryOrders("open"))
    .filter((row) => row.customerId === padaria?.id && row.id !== orderId)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const factoryAfterRepeat = await stockQty("factory", "cox-mini");
  record(
    "Pedido repetido ainda só reserva o poço",
    repeatWell?.status === "sem_saldo" &&
      repeatWell.items.find((item) => item.nicheId === "cox-mini")?.availableQty === 0 &&
      factoryAfterRepeat === factoryAfterDeliver,
    `${repeatWell?.statusLabel ?? "sumiu"} · livres ${repeatWell?.items.find((item) => item.nicheId === "cox-mini")?.availableQty} · câmara ${factoryAfterRepeat}`,
  );

  await expectOk("Loja 2 pede 40 depois da entrega", () =>
    createStoreRequest({ fromLocationId: "store_2", items: [{ nicheId: "cox-mini", qty: 40 }] }),
  );
  const store2Ask = (await listRequests("open")).find(
    (row) => row.fromLocationId === "store_2" && row.items.some((item) => item.qty === 40),
  );
  record(
    "Pedido novo da loja envelhece se o poço acabou",
    store2Ask?.status === "sem_saldo" && store2Ask.items[0]?.availableQty === 0,
    `${store2Ask?.statusLabel ?? "sumiu"} · livres ${store2Ask?.items[0]?.availableQty}`,
  );
  const store2Row = store2Ask ? await db.requests.get(store2Ask.id) : undefined;
  record(
    "sem_saldo do pedido da loja persiste no banco",
    store2Row?.status === "sem_saldo",
    `db=${store2Row?.status}`,
  );
  await produceItems({ items: [{ nicheId: "cox-mini", qty: 200 }], madeAt: today });
  const store2AfterProduce = store2Ask ? await db.requests.get(store2Ask.id) : undefined;
  record(
    "Produzir de novo tira o pedido de sem_saldo",
    store2AfterProduce?.status === "pending" || store2AfterProduce?.status === "parcial",
    `status=${store2AfterProduce?.status}`,
  );
  const coxPos = (await factoryStockPosition()).find((row) => row.nicheId === "cox-mini");
  record(
    "Saldo na câmara separa reservado e livre",
    Boolean(coxPos && coxPos.reserved >= 40 && coxPos.sellable >= coxPos.reserved),
    `válido=${coxPos?.sellable} reservado=${coxPos?.reserved} livre=${coxPos?.free} trânsito=${coxPos?.inTransit}`,
  );

  record("parseMoney 1.500 é milhar", parseMoney("1.500") === 1500, String(parseMoney("1.500")));
  record("parseMoney 1,50 é decimal", parseMoney("1,50") === 1.5, String(parseMoney("1,50")));
  record("parseMoney 1.50 é decimal", parseMoney("1.50") === 1.5, String(parseMoney("1.50")));
  record("parseMoney texto vira NaN", Number.isNaN(parseMoney("abc")), String(parseMoney("abc")));
  await expectFail("changeStock recusa quantidade NaN", () => changeStock("factory", "cox-mini", "lot-x", Number.NaN), "número");

  const lotWrong = "lot-wrong-niche";
  await db.lots.add({
    id: lotWrong,
    nicheId: "cox-mini",
    madeAt: addDays(today, -5),
    expiresAt: addDays(today, -1),
    unitCost: 0.45,
    unitPrice: 1.5,
  });
  await db.stock.put({
    id: `factory:cox-mini:${lotWrong}`,
    locationId: "factory",
    nicheId: "cox-mini",
    lotId: lotWrong,
    qty: 2,
  });
  await expectFail(
    "Descarte recusa lote de outro produto",
    () =>
      discardExpiredLots({
        items: [{ locationId: "factory", nicheId: "coca-350", lotId: lotWrong, qty: 1 }],
      }),
    "lote",
  );

  for (const row of await listRequests("open")) {
    await cancelRequest(row.id);
  }
  for (const row of await listFactoryOrders("open")) {
    await cancelFactoryOrder(row.id);
  }
  await produceItems({ items: [{ nicheId: "cox-mini", qty: 20 }], madeAt: today });
  const raceReq = await createStoreRequest({
    fromLocationId: "store_1",
    items: [{ nicheId: "cox-mini", qty: 10 }],
  });
  const factoryBeforeRace = await stockQty("factory", "cox-mini");
  const raceSend = await Promise.allSettled([
    fulfillRequest(raceReq, { "cox-mini": 10 }, "Rita"),
    fulfillRequest(raceReq, { "cox-mini": 10 }, "Rita"),
  ]);
  const sentOk = raceSend.filter((row) => row.status === "fulfilled").length;
  const factoryAfterRace = await stockQty("factory", "cox-mini");
  const raceItems = await db.requestItems.where("requestId").equals(raceReq).toArray();
  record(
    "Dois Mandar no mesmo pedido só expedem uma vez",
    sentOk === 1 && factoryBeforeRace - factoryAfterRace === 10 && (raceItems[0]?.sentQty ?? 0) === 10,
    `ok=${sentOk} baixou ${factoryBeforeRace - factoryAfterRace} · sentQty ${raceItems[0]?.sentQty}`,
  );

  await produceItems({ items: [{ nicheId: "cox-mini", qty: 20 }], madeAt: today });
  const raceOrder = await createFactoryOrder({
    customerId: padaria?.id ?? "x",
    items: [{ nicheId: "cox-mini", qty: 10 }],
  });
  const factoryBeforeDeliverRace = await stockQty("factory", "cox-mini");
  const raceDeliver = await Promise.allSettled([
    deliverFactoryOrder(raceOrder, { "cox-mini": 10 }, { method: "pix" }),
    deliverFactoryOrder(raceOrder, { "cox-mini": 10 }, { method: "pix" }),
  ]);
  const deliveredOk = raceDeliver.filter((row) => row.status === "fulfilled").length;
  const factoryAfterDeliverRace = await stockQty("factory", "cox-mini");
  const raceOrderItems = await db.factoryOrderItems.where("orderId").equals(raceOrder).toArray();
  record(
    "Dois Cliente levou no mesmo pedido só baixam uma vez",
    deliveredOk === 1 &&
      factoryBeforeDeliverRace - factoryAfterDeliverRace === 10 &&
      (raceOrderItems[0]?.sentQty ?? 0) === 10,
    `ok=${deliveredOk} baixou ${factoryBeforeDeliverRace - factoryAfterDeliverRace} · sentQty ${raceOrderItems[0]?.sentQty}`,
  );

  for (const row of await listRequests("open")) {
    await cancelRequest(row.id);
  }
  for (const row of await listFactoryOrders("open")) {
    await cancelFactoryOrder(row.id);
  }
  await produceItems({ items: [{ nicheId: "cox-mini", qty: 80 }], madeAt: today });
  const factoryBeforeParty = await stockQty("factory", "cox-mini");
  const storeBeforeParty = await stockQty("store_1", "cox-mini");
  const partyDay = addDays(today, 5);
  const partyId = (await expectOk("Loja lança encomenda com data sem baixar estoque", () =>
    createStoreRequest({
      fromLocationId: "store_1",
      kind: "encomenda",
      neededBy: partyDay,
      estimatedTotal: 400,
      items: [{ nicheId: "cox-mini", qty: 40 }],
    }),
  )) as string | null;
  const factoryAfterPartyAsk = await stockQty("factory", "cox-mini");
  const storeAfterPartyAsk = await stockQty("store_1", "cox-mini");
  const partyRow = partyId ? await db.requests.get(partyId) : undefined;
  const partyNotes = (await db.notifications.toArray()).filter((row) => row.refId === partyId);
  record(
    "Festa sem sinal ainda não avisa a fábrica",
    partyRow?.kind === "encomenda" &&
      partyRow.neededBy === partyDay &&
      factoryAfterPartyAsk === factoryBeforeParty &&
      storeAfterPartyAsk === storeBeforeParty &&
      !partyNotes.some((row) => row.audience === "factory" && row.title.toLowerCase().includes("encomendou")),
    `neededBy=${partyRow?.neededBy} avisos=${partyNotes.length}`,
  );
  if (partyId) {
    await expectFail(
      "Fábrica não manda festa sem sinal",
      () => fulfillRequest(partyId, { "cox-mini": 40 }, "Rita"),
      "sinal",
    );
  }

  const cashBeforeSignal = await currentCashSession("store_1");
  if (!cashBeforeSignal) {
    await openCashSession({ locationId: "store_1", period: "tarde", employeeId: "emp-telma", openingAmount: 150 });
  }
  const sessionForParty = await currentCashSession("store_1");
  const ledgerBeforeSignal = sessionForParty ? await sessionLedger(sessionForParty.id) : null;
  if (partyId) {
    await expectOk("Sinal entra no caixa sem baixar estoque", () =>
      takeEncomendaSignal({ requestId: partyId, amount: 200, payment: "pix" }),
    );
  }
  const ledgerAfterSignal = sessionForParty ? await sessionLedger(sessionForParty.id) : null;
  const storeAfterSignal = await stockQty("store_1", "cox-mini");
  const factoryAfterSignal = await stockQty("factory", "cox-mini");
  const signalSale = partyId
    ? (await db.sales.toArray()).find((sale) => sale.requestId === partyId && sale.kind === "sinal")
    : undefined;
  record(
    "Sinal não mexe estoque e não entra no faturamento do turno",
    Boolean(signalSale) &&
      signalSale.channel === "encomenda" &&
      storeAfterSignal === storeAfterPartyAsk &&
      factoryAfterSignal === factoryAfterPartyAsk &&
      Math.abs((ledgerAfterSignal?.byPayment.pix ?? 0) - (ledgerBeforeSignal?.byPayment.pix ?? 0) - 200) < 0.01 &&
      Math.abs((ledgerAfterSignal?.salesTotal ?? 0) - (ledgerBeforeSignal?.salesTotal ?? 0)) < 0.01,
    `pix +${((ledgerAfterSignal?.byPayment.pix ?? 0) - (ledgerBeforeSignal?.byPayment.pix ?? 0)).toFixed(2)} fatura ${ledgerAfterSignal?.salesTotal} canal=${signalSale?.channel}`,
  );
  const partyNotesAfterSignal = partyId
    ? (await db.notifications.toArray()).filter((row) => row.refId === partyId)
    : [];
  record(
    "Sinal avisa a fábrica com a data da festa",
    partyNotesAfterSignal.some((row) => row.audience === "factory" && row.title.toLowerCase().includes("encomendou")),
    `avisos=${partyNotesAfterSignal.length}`,
  );
  const openAfterSignal = partyId ? (await listOpenParties()).find((row) => row.id === partyId) : undefined;
  record(
    "Admin vê festa com sinal e o resto a receber",
    openAfterSignal?.due === 200 && openAfterSignal.stock === "aguardando",
    `due=${openAfterSignal?.due} stock=${openAfterSignal?.stock}`,
  );
  const storeParties = await listOpenParties("store_1");
  const otherStoreParties = await listOpenParties("store_2");
  record(
    "Loja só vê a festa dela",
    Boolean(partyId) &&
      storeParties.some((row) => row.id === partyId) &&
      !otherStoreParties.some((row) => row.id === partyId),
    `centro=${storeParties.length} jardim=${otherStoreParties.length}`,
  );

  if (partyId) {
    await expectOk("Fábrica manda a encomenda da festa", () => fulfillRequest(partyId, { "cox-mini": 40 }, "Rita"));
    const openInTransit = (await listOpenParties()).find((row) => row.id === partyId);
    record(
      "Festa mandada continua na lista enquanto falta o resto",
      openInTransit?.stock === "em_transito" && openInTransit.due === 200,
      `stock=${openInTransit?.stock} due=${openInTransit?.due}`,
    );
    await expectFail(
      "Entrega da festa recusa envio ainda em trânsito",
      () => deliverEncomenda({ requestId: partyId, payment: "pix" }),
      "receber",
    );
    const partyTransfers = (await db.transfers.toArray()).filter((row) => row.requestId === partyId);
    const openParty = partyTransfers.find((row) => !row.receivedAt);
    if (openParty) {
      const parts = await db.transferItems.where("transferId").equals(openParty.id).toArray();
      await expectOk("Loja confere o envio da encomenda", () =>
        receiveTransfer({
          transferId: openParty.id,
          receivedBy: "Ana",
          items: parts.map((part) => ({ id: part.id, receivedQty: part.qty })),
        }),
      );
    }
    const openAtStore = (await listOpenParties()).find((row) => row.id === partyId);
    record(
      "Festa conferida espera o resto na loja",
      openAtStore?.stock === "na_loja" && openAtStore.due === 200,
      `stock=${openAtStore?.stock} due=${openAtStore?.due}`,
    );
    const partyQuote = await quoteEncomendaDelivery(partyId);
    record(
      "Entrega da festa compara FIFO com o combinado",
      partyQuote.combinedTotal === 400 &&
        partyQuote.fifoTotal === 60 &&
        partyQuote.due === 200 &&
        partyQuote.differs,
      `fifo=${partyQuote.fifoTotal} combinado=${partyQuote.combinedTotal} resto=${partyQuote.due}`,
    );
    const storeBeforeDeliver = await stockQty("store_1", "cox-mini");
    const ledgerBeforeDeliver = sessionForParty ? await sessionLedger(sessionForParty.id) : null;
    await expectOk("Resto entra e a festa sai da prateleira da loja", () =>
      deliverEncomenda({ requestId: partyId, payment: "pix" }),
    );
    const storeAfterDeliver = await stockQty("store_1", "cox-mini");
    const delivered = await db.requests.get(partyId);
    const remainder = delivered?.remainderSaleId ? await db.sales.get(delivered.remainderSaleId) : undefined;
    const ledgerAfterDeliver = sessionForParty ? await sessionLedger(sessionForParty.id) : null;
    const openAfterDeliver = (await listOpenParties()).some((row) => row.id === partyId);
    record(
      "Entrega da festa cobra o resto, baixa a loja e fatura o total combinado",
      Boolean(delivered?.deliveredAt) &&
        storeBeforeDeliver - storeAfterDeliver === 40 &&
        remainder?.total === 400 &&
        remainder?.channel === "encomenda" &&
        remainder?.kind !== "sinal" &&
        Math.abs((ledgerAfterDeliver?.byPayment.pix ?? 0) - (ledgerBeforeDeliver?.byPayment.pix ?? 0) - 200) < 0.01 &&
        Math.abs((ledgerAfterDeliver?.salesTotal ?? 0) - (ledgerBeforeDeliver?.salesTotal ?? 0) - 400) < 0.01,
      `baixou ${storeBeforeDeliver - storeAfterDeliver} cupom ${remainder?.total} fatura ${ledgerAfterDeliver?.salesTotal} canal=${remainder?.channel}`,
    );
    record("Festa entregue some da lista do admin", !openAfterDeliver, `aindaAberta=${openAfterDeliver}`);
    await expectFail(
      "Dois cliques em entregar não geram outro cupom",
      () => deliverEncomenda({ requestId: partyId, payment: "pix" }),
      "entregue",
    );
    if (delivered?.remainderSaleId) {
      await expectOk("Estorno do resto reabre a festa", () =>
        voidSale({ saleId: delivered.remainderSaleId!, reason: "desistencia" }),
      );
      const reopened = await db.requests.get(partyId);
      const openAgain = (await listOpenParties()).some((row) => row.id === partyId);
      record(
        "Estornar resto limpa a entrega",
        Boolean(reopened && !reopened.deliveredAt && !reopened.remainderSaleId && openAgain),
        `deliveredAt=${reopened?.deliveredAt} remainder=${reopened?.remainderSaleId} lista=${openAgain}`,
      );
      await expectOk("Festa reentregável após estorno", () =>
        deliverEncomenda({ requestId: partyId, payment: "pix" }),
      );
    }
  }

  const madePast = addDays(today, -3);
  await produceItems({ items: [{ nicheId: "cox-mini", qty: 9 }], madeAt: madePast });
  const logsPast = await listProductionLogs(400, madePast, madePast);
  const logsTodayOnly = await listProductionLogs(400, today, today);
  record(
    "Registro de produção recorta pelo dia em que foi feito",
    logsPast.some((log) => log.madeAt === madePast && log.items.some((item) => item.qty === 9)) &&
      !logsTodayOnly.some((log) => log.madeAt === madePast),
    `passado=${logsPast.length} hoje=${logsTodayOnly.length}`,
  );

  const tomorrow = addDays(today, 1);
  const tomorrowDow = new Date(`${tomorrow}T12:00:00`).getDay();
  const alertCustomerId = await saveCustomer({
    name: "Padaria Alerta",
    kind: "volume",
    usualWeekdays: [tomorrowDow],
  });
  await ensurePortfolioAlerts();
  const portfolioNotes = (await db.notifications.where("type").equals("portfolio_reminder").toArray()).filter(
    (row) => row.refId?.startsWith(`${alertCustomerId}:`),
  );
  record(
    "Carteira avisa na véspera sem chutar quantidade",
    portfolioNotes.some((row) => row.audience === "factory" && row.title.includes("Amanhã") && !/\d+\s*un/.test(row.title + row.body)),
    portfolioNotes.map((row) => row.title).join(" · "),
  );

  const dashBeforeClient = await loadDashboard("today", "admin");
  await produceItems({ items: [{ nicheId: "cox-mini", qty: 80 }], madeAt: today });
  const volumeOrder = await createFactoryOrder({
    customerId: padaria?.id ?? "x",
    items: [{ nicheId: "cox-mini", qty: 80 }],
  });
  await expectOk("Padaria levou 80 da câmara", () =>
    deliverFactoryOrder(volumeOrder, { "cox-mini": 80 }, { method: "pix" }),
  );
  const dashAfterClient = await loadDashboard("today", "admin");
  const clientMoves = (await db.movements.toArray()).filter((row) => row.type === "cliente" && row.refId === volumeOrder);
  const clientCost = clientMoves.reduce((sum, row) => sum + Math.abs(row.qty) * (row.unitCost ?? 0), 0);
  const clientRev = clientMoves.reduce((sum, row) => sum + Math.abs(row.qty) * (row.unitPrice ?? 0), 0);
  const factoryClients = await reportFactoryClients(reportWindow("today"));
  record(
    "Volume sai da câmara com preço, paga na fábrica e não soma no Vendeu da loja",
      dashAfterClient.clienteQty - dashBeforeClient.clienteQty === 80 &&
      Math.abs(dashAfterClient.revenue - dashBeforeClient.revenue) < 0.01 &&
      Math.abs(dashAfterClient.clienteRevenue - dashBeforeClient.clienteRevenue - clientRev) < 0.01 &&
      clientRev > 0 &&
      clientMoves.every((row) => (row.unitCost ?? 0) > 0 && (row.unitPrice ?? 0) > 0 && row.payment === "pix") &&
      factoryClients.rows.some((row) =>
        row.some((cell) => String(cell).toLowerCase().includes("pix")),
      ),
    `cliente ${dashAfterClient.clienteQty} recebeu ${clientRev} custo ${clientCost} vendeu ${dashAfterClient.revenue}`,
  );

  await produceItems({ items: [{ nicheId: "cox-mini", qty: 20 }], madeAt: today });
  const extraSend = (await expectOk("Mandar 15 para a retirada", () =>
    sendToStore({
      toLocationId: "store_1",
      items: [{ nicheId: "cox-mini", qty: 15 }],
      sentBy: "Rita",
    }),
  )) as string | null;
  if (extraSend) {
    const extraParts = await db.transferItems.where("transferId").equals(extraSend).toArray();
    await expectOk("Loja confere o envio da retirada", () =>
      receiveTransfer({
        transferId: extraSend,
        receivedBy: "Ana",
        items: extraParts.map((part) => ({ id: part.id, receivedQty: part.qty })),
      }),
    );
  }
  const storeBeforeWithdraw = await stockQty("store_1", "cox-mini");
  let liveWithdraw = await currentCashSession("store_1");
  if (!liveWithdraw) {
    await openCashSession({ locationId: "store_1", period: "tarde", employeeId: "emp-telma", openingAmount: 150 });
    liveWithdraw = await currentCashSession("store_1");
  }
  let ledgerBeforeWithdraw = liveWithdraw ? await sessionLedger(liveWithdraw.id) : null;
  if (liveWithdraw && (ledgerBeforeWithdraw?.expectedCash ?? 0) < 1) {
    await checkout({
      locationId: "store_1",
      channel: "caixa",
      payment: "dinheiro",
      items: [{ nicheId: "cox-mini", qty: 1 }],
    });
    ledgerBeforeWithdraw = await sessionLedger(liveWithdraw.id);
  }
  const storeQtyBeforeWithdraw = await stockQty("store_1", "cox-mini");
  const salesBeforeWithdraw = liveWithdraw
    ? (await db.sales.where("cashSessionId").equals(liveWithdraw.id).toArray()).filter((sale) => !sale.voidedAt).length
    : 0;
  const withdrawAmount = Math.min(20, Math.max(1, Math.round((ledgerBeforeWithdraw?.expectedCash ?? 1) * 100) / 100));
  await expectOk("Retirada baixa produto e gaveta na mesma tacada", () =>
    withdrawProductAndCash({
      locationId: "store_1",
      nicheId: "cox-mini",
      qty: 10,
      amount: withdrawAmount,
      reason: "dono levou",
      destination: "cofre",
    }),
  );
  const storeAfterWithdraw = await stockQty("store_1", "cox-mini");
  const ledgerAfterWithdraw = liveWithdraw ? await sessionLedger(liveWithdraw.id) : null;
  const salesAfterWithdraw = liveWithdraw
    ? (await db.sales.where("cashSessionId").equals(liveWithdraw.id).toArray()).filter((sale) => !sale.voidedAt).length
    : 0;
  const withdrawMoves = (await db.movements.toArray()).filter((row) => row.type === "retirada");
  record(
    "Retirada não vira venda",
    storeQtyBeforeWithdraw - storeAfterWithdraw === 10 &&
      (ledgerAfterWithdraw?.sangriaTotal ?? 0) > (ledgerBeforeWithdraw?.sangriaTotal ?? 0) &&
      salesAfterWithdraw === salesBeforeWithdraw &&
      withdrawMoves.length > 0,
    `baixou ${storeQtyBeforeWithdraw - storeAfterWithdraw} sangria ${ledgerAfterWithdraw?.sangriaTotal}`,
  );

  await db.sales.add({
    id: "sale-round-test",
    locationId: "store_1",
    channel: "caixa",
    payment: "pix",
    total: 10,
    at: `${today}T20:00:00.000Z`,
    cashSessionId: "sess-round",
  });
  await db.saleItems.add({
    id: "sale-round-item",
    saleId: "sale-round-test",
    nicheId: "cox-mini",
    lotId: "lot-x",
    qty: 3,
    unitPrice: 3.33,
    unitCost: 0.45,
  });
  const closingWindow = reportWindow("today");
  const closing = await reportClosing(closingWindow, "store_1");
  const liveCupons = (await db.sales.toArray()).filter(
    (sale) =>
      sale.locationId === "store_1" &&
      isRevenueSale(sale) &&
      sale.at >= closingWindow.from &&
      sale.at <= closingWindow.to,
  );
  const fromCupom = liveCupons.reduce((sum, sale) => sum + sale.total, 0);
  const cupomItems = (
    await Promise.all(liveCupons.map((sale) => db.saleItems.where("saleId").equals(sale.id).toArray()))
  ).flat();
  const fromItems = cupomItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const totalRow = closing.rows.find((row) => row[0] === "TOTAL");
  record(
    "Fechamento fatura pelo total do cupom",
    String(totalRow?.[3]) === formatBRL(fromCupom) && Math.abs(fromCupom - fromItems) > 0.004,
    `faturamento ${String(totalRow?.[3])} · cupom ${formatBRL(fromCupom)} · itens ${formatBRL(fromItems)}`,
  );

  await loadDemoData({ force: true });
  const demoDay = (await db.settings.get(DEMO_AS_OF_SETTING))?.value;
  record("Exemplo grava o dia de hoje", demoDay === today, `asOf=${demoDay}`);
  const expiredDemo = await db.stock.get("store_1:cox-mini:lot-expired-cox");
  record("Vencido de propósito são 8, não milhares", expiredDemo?.qty === 8, `qty=${expiredDemo?.qty}`);
  const demoExpiredLots = (await db.lots.toArray()).filter((lot) => lot.expiresAt && lot.expiresAt < today);
  const expiredQty = (await db.stock.toArray())
    .filter((row) => demoExpiredLots.some((lot) => lot.id === row.lotId))
    .reduce((sum, row) => sum + row.qty, 0);
  record("Estoque vencido do exemplo cabe na faixa", expiredQty > 0 && expiredQty < 80, `un=${expiredQty}`);
  await db.settings.put({ id: DEMO_AS_OF_SETTING, value: addDays(today, -1) });
  await ensureDemoData();
  const afterRoll = (await db.settings.get(DEMO_AS_OF_SETTING))?.value;
  const expiredAfter = await db.stock.get("store_1:cox-mini:lot-expired-cox");
  record(
    "Virar o dia regrava o exemplo",
    afterRoll === today && expiredAfter?.qty === 8,
    `asOf=${afterRoll} qty=${expiredAfter?.qty}`,
  );

  const passed = rows.filter((row) => row.pass).length;
  const failed = rows.filter((row) => !row.pass).length;
  console.log("\n--- RESUMO ---");
  console.log(JSON.stringify({ passed, failed, total: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
