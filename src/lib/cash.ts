import { getDb } from "./db";
import { isStore } from "./locations";
import { newId, todayDate } from "./money";
import { catalogItems } from "./queries";
import { deactivatePerson, PeopleError, personCanCash, personCanConsume, personLocation, savePerson } from "./people";
import type {
  CashDestination,
  CashMovement,
  CashMovementKind,
  CashPeriod,
  CashSession,
  Employee,
  PaymentMethod,
  Sale,
} from "./types";
import { CASH_DESTINATIONS, isLiveSale, salePayments } from "./types";

function localDay(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function cashDay(iso: string) {
  return localDay(iso);
}

export const CASH_REOPEN_SETTING = "cash-reopen-code";
export const CASH_REOPEN_CODE = "reabrir";

export class CashError extends Error {}

export const CASH_PERIODS: { id: CashPeriod; label: string; hint: string }[] = [
  { id: "manha", label: "Manhã", hint: "Quem abre a loja e fica no primeiro turno." },
  { id: "tarde", label: "Tarde", hint: "Quem assume depois do almoço até fechar." },
];

export function cashPeriodLabel(period: CashPeriod) {
  return CASH_PERIODS.find((item) => item.id === period)?.label ?? period;
}

export function money2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function cashDifferenceLabel(difference: number) {
  if (Math.abs(difference) < 0.005) return "Caixa bateu";
  if (difference < 0) return "Quebra de caixa";
  return "Sobra de caixa";
}

export type CashLedger = {
  session: CashSession;
  salesCount: number;
  salesTotal: number;
  byPayment: Record<PaymentMethod, number>;
  movements: CashMovement[];
  sangriaTotal: number;
  supplyTotal: number;
  openingAmount: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
};

export async function listEmployees(storeId?: string) {
  const rows = await getDb().employees.toArray();
  return rows
    .filter((item) => item.active && personCanCash(item) && (!storeId || personLocation(item) === storeId))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function saveEmployee(input: { id?: string; name: string; storeId: string }) {
  try {
    const current = input.id ? await getDb().employees.get(input.id) : undefined;
    return await savePerson({
      id: input.id,
      name: input.name,
      locationId: input.storeId,
      podeCaixa: true,
      podeConsumo: current ? personCanConsume(current) : false,
      login: current?.login,
      password: current?.password,
    });
  } catch (err) {
    throw err instanceof PeopleError ? new CashError(err.message) : err;
  }
}

export async function removeEmployee(id: string) {
  try {
    await deactivatePerson(id);
  } catch (err) {
    throw err instanceof PeopleError ? new CashError(err.message) : err;
  }
}

export async function openCashSession(input: {
  locationId: string;
  period: CashPeriod;
  employeeId: string;
  openingAmount: number;
}) {
  if (!isStore(input.locationId)) throw new CashError("O caixa é aberto na loja.");
  const db = getDb();
  const employee = await db.employees.get(input.employeeId);
  if (!employee || !employee.active) throw new CashError("Escolha o funcionário responsável.");
  if (!personCanCash(employee) || personLocation(employee) !== input.locationId) {
    throw new CashError("Esse funcionário não abre o caixa desta loja.");
  }

  const open = await currentCashSession(input.locationId);
  if (open) {
    throw new CashError(
      `Já tem um caixa aberto (${cashPeriodLabel(open.period)} · ${open.employeeName}). Feche antes de abrir outro.`,
    );
  }

  const today = todayDate();
  const samePeriod = (await db.cashSessions.where("locationId").equals(input.locationId).toArray()).find(
    (row) => row.period === input.period && localDay(row.openedAt) === today,
  );
  if (samePeriod) {
    throw new CashError(`O período da ${cashPeriodLabel(input.period).toLowerCase()} desta loja já foi usado hoje.`);
  }

  const session: CashSession = {
    id: newId(),
    locationId: input.locationId,
    period: input.period,
    employeeId: employee.id,
    employeeName: employee.name,
    openedAt: new Date().toISOString(),
    openingAmount: money2(Math.max(0, input.openingAmount)),
  };
  await db.cashSessions.add(session);
  return session;
}

export async function registerCashMovement(input: {
  sessionId: string;
  type: CashMovementKind;
  amount: number;
  reason: string;
  destination?: CashDestination;
}) {
  const db = getDb();
  const session = await db.cashSessions.get(input.sessionId);
  if (!session || session.closedAt) throw new CashError("Esse caixa já foi fechado.");

  const amount = money2(input.amount);
  if (amount <= 0) throw new CashError("Informe um valor maior que zero.");

  const reason = input.reason.trim();
  if (!reason) {
    throw new CashError(
      input.type === "sangria" ? "Informe o motivo da sangria." : "Informe o motivo do suprimento.",
    );
  }

  if (input.type === "sangria" && !CASH_DESTINATIONS.some((item) => item.id === input.destination)) {
    throw new CashError("A sangria precisa ir para o cofre ou para o depósito. Não existe sangria sem destino.");
  }

  const ledger = await sessionLedger(session.id);
  if (input.type === "sangria" && amount > ledger.expectedCash + 0.001) {
    throw new CashError("A sangria não pode ser maior que o saldo esperado em espécie na gaveta.");
  }

  const row: CashMovement = {
    id: newId(),
    sessionId: session.id,
    locationId: session.locationId,
    type: input.type,
    amount,
    reason,
    at: new Date().toISOString(),
    destination: input.type === "sangria" ? input.destination : undefined,
  };
  await db.cashMovements.add(row);
  return row;
}

export function needsCashRecount(difference: number) {
  return Math.abs(difference) >= 0.005;
}

export async function closeCashSession(input: {
  sessionId: string;
  closingAmount: number;
  secondCount?: number;
  recountedBy?: string;
  note?: string;
}) {
  const db = getDb();
  const session = await db.cashSessions.get(input.sessionId);
  if (!session || session.closedAt) throw new CashError("Esse caixa já foi fechado.");

  const ledger = await sessionLedger(session.id);
  const closingAmount = money2(Math.max(0, input.closingAmount));
  const difference = money2(closingAmount - ledger.expectedCash);

  let secondCount: number | undefined;
  let recountedBy: string | undefined;
  if (needsCashRecount(difference)) {
    if (input.secondCount == null || Number.isNaN(input.secondCount)) {
      throw new CashError("Quebra ou sobra: conte o dinheiro de novo antes de encerrar.");
    }
    secondCount = money2(Math.max(0, input.secondCount));
    if (Math.abs(secondCount - closingAmount) >= 0.005) {
      throw new CashError("A segunda contagem tem que bater com a primeira. Se achou outro valor, corrija o apurado e conte de novo.");
    }
    recountedBy = input.recountedBy?.trim() ?? "";
    if (recountedBy.length < 2) {
      throw new CashError("Quem conferiu a segunda contagem? Escreva o nome.");
    }
  }

  await db.cashSessions.update(session.id, {
    closedAt: new Date().toISOString(),
    closingAmount,
    expectedAmount: ledger.expectedCash,
    difference,
    cashSales: ledger.byPayment.dinheiro,
    pixSales: ledger.byPayment.pix,
    cardSales: ledger.byPayment.cartao,
    sangriaTotal: ledger.sangriaTotal,
    supplyTotal: ledger.supplyTotal,
    note: input.note?.trim() ?? "",
    secondCount,
    recountedBy,
  });
}

export async function ensureReopenCode() {
  const db = getDb();
  const row = await db.settings.get(CASH_REOPEN_SETTING);
  if (row?.value.trim()) return row.value.trim();
  await db.settings.put({ id: CASH_REOPEN_SETTING, value: CASH_REOPEN_CODE });
  return CASH_REOPEN_CODE;
}

export async function reopenCashSession(input: {
  sessionId: string;
  password: string;
  note: string;
}) {
  const db = getDb();
  const session = await db.cashSessions.get(input.sessionId);
  if (!session) throw new CashError("Caixa não encontrado.");
  if (!session.closedAt) throw new CashError("Esse caixa ainda está aberto.");
  if (localDay(session.openedAt) !== todayDate()) {
    throw new CashError("Só reabre o caixa do dia. Turno de outro dia fica como está.");
  }

  const open = await currentCashSession(session.locationId);
  if (open) {
    throw new CashError(
      `Já tem um caixa aberto nesta loja (${cashPeriodLabel(open.period)} · ${open.employeeName}). Feche antes de reabrir outro.`,
    );
  }

  const code = await ensureReopenCode();
  if ((input.password ?? "").trim() !== code) {
    throw new CashError("Senha de reabertura não confere.");
  }

  const note = input.note.trim();
  if (note.length < 3) {
    throw new CashError("Escreva por que está reabrindo. O dia precisa de um motivo.");
  }

  const next: CashSession = {
    ...session,
    reopenedAt: new Date().toISOString(),
    reopenNote: note,
    reopenCount: (session.reopenCount ?? 0) + 1,
  };
  delete next.closedAt;
  delete next.closingAmount;
  delete next.expectedAmount;
  delete next.difference;
  delete next.cashSales;
  delete next.pixSales;
  delete next.cardSales;
  delete next.sangriaTotal;
  delete next.supplyTotal;
  delete next.secondCount;
  delete next.recountedBy;
  await db.cashSessions.put(next);
  return next;
}

export async function currentCashSession(locationId: string) {
  const rows = await getDb().cashSessions.where("locationId").equals(locationId).toArray();
  return rows.find((row) => !row.closedAt) ?? null;
}

export async function listCashSessions(locationId?: string) {
  const rows = locationId
    ? await getDb().cashSessions.where("locationId").equals(locationId).toArray()
    : await getDb().cashSessions.toArray();
  return rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export async function lastClosedSession(locationId: string) {
  const rows = await listCashSessions(locationId);
  return rows.find((row) => row.closedAt && row.closingAmount != null) ?? null;
}

export async function sessionSalesTotal(sessionId: string) {
  const ledger = await sessionLedger(sessionId);
  return { count: ledger.salesCount, total: ledger.salesTotal };
}

export type SessionTicketItem = {
  label: string;
  qty: number;
  unitPrice: number;
  promo?: boolean;
};

export type SessionTicket = {
  sale: Sale;
  items: SessionTicketItem[];
};

export async function listSessionTickets(sessionId: string): Promise<SessionTicket[]> {
  const db = getDb();
  const [sales, catalog] = await Promise.all([
    db.sales.where("cashSessionId").equals(sessionId).toArray(),
    catalogItems(false),
  ]);
  const labels = new Map(catalog.map((item) => [item.niche.id, item.label]));
  const tickets = await Promise.all(
    sales.map(async (sale) => {
      const items = await db.saleItems.where("saleId").equals(sale.id).toArray();
      return {
        sale,
        items: items.map((item) => ({
          label: labels.get(item.nicheId) ?? "Produto",
          qty: item.qty,
          unitPrice: item.unitPrice,
          promo: item.promo,
        })),
      };
    }),
  );
  return tickets.sort((a, b) => b.sale.at.localeCompare(a.sale.at));
}

export async function sessionLedger(sessionId: string): Promise<CashLedger> {
  const db = getDb();
  const session = await db.cashSessions.get(sessionId);
  if (!session) throw new CashError("Caixa não encontrado.");

  const sales = (await db.sales.where("cashSessionId").equals(sessionId).toArray()).filter(isLiveSale);
  const movements = (
    (await db.cashMovements?.where("sessionId").equals(sessionId).toArray().catch(() => [])) ?? []
  ).sort((a, b) => a.at.localeCompare(b.at));

  const byPayment: Record<PaymentMethod, number> = { dinheiro: 0, pix: 0, cartao: 0 };
  for (const sale of sales) {
    for (const row of salePayments(sale)) {
      byPayment[row.method] += row.amount;
    }
  }

  const sangriaTotal = money2(
    movements.filter((item) => item.type === "sangria").reduce((sum, item) => sum + item.amount, 0),
  );
  const supplyTotal = money2(
    movements.filter((item) => item.type === "suprimento").reduce((sum, item) => sum + item.amount, 0),
  );
  const openingAmount = money2(session.openingAmount);
  const expectedCash = money2(openingAmount + supplyTotal + byPayment.dinheiro - sangriaTotal);
  const countedCash = session.closingAmount != null ? money2(session.closingAmount) : undefined;
  const difference =
    session.difference != null
      ? money2(session.difference)
      : countedCash != null
        ? money2(countedCash - expectedCash)
        : undefined;

  return {
    session,
    salesCount: sales.length,
    salesTotal: money2(sales.reduce((sum, sale) => sum + sale.total, 0)),
    byPayment: {
      dinheiro: money2(byPayment.dinheiro),
      pix: money2(byPayment.pix),
      cartao: money2(byPayment.cartao),
    },
    movements,
    sangriaTotal,
    supplyTotal,
    openingAmount,
    expectedCash,
    countedCash,
    difference,
  };
}
