import { currentCashSession } from "./cash";
import { getDb } from "./db";
import { catalogItems } from "./queries";
import { FACTORY_LOCATION, getLocation, isStore, storeLocations } from "./locations";
import { newId, todayDate } from "./money";
import { oldestLots, changeStock } from "./stock-core";
import {
  asConsumeUser,
  deactivatePerson,
  normalizeLogin,
  PeopleError,
  personCanCash,
  personCanConsume,
  personLocation,
  savePerson,
} from "./people";
import type { ConsumeUser, InternalAllowance } from "./types";
import { closedCatalogMessage, lotCost, productIsLive } from "./types";

export class ConsumeError extends Error {}

export function consumePlaces() {
  return storeLocations();
}

export function consumeWorkplaces() {
  return [FACTORY_LOCATION, ...storeLocations()];
}

export function isFactoryConsumeStaff(locationId: string) {
  return locationId === "factory";
}

export function consumePlaceName(locationId: string) {
  if (locationId === "factory") return FACTORY_LOCATION.name;
  return getLocation(locationId)?.name ?? locationId;
}

export function consumeWorkplaceLabel(locationId: string) {
  if (locationId === "factory") return "Fábrica · retira 1× ao dia em qualquer loja";
  return consumePlaceName(locationId);
}

export async function listConsumeUsers(locationId?: string) {
  const rows = await getDb().employees.toArray();
  return rows
    .filter((item) => {
      if (!item.active || !personCanConsume(item)) return false;
      const workplace = personLocation(item);
      if (!locationId) return true;
      if (workplace === locationId) return true;
      return isStore(locationId) && isFactoryConsumeStaff(workplace);
    })
    .map(asConsumeUser)
    .sort((a, b) => {
      const factoryRank = Number(isFactoryConsumeStaff(b.locationId)) - Number(isFactoryConsumeStaff(a.locationId));
      if (factoryRank !== 0) return factoryRank;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

export async function saveConsumeUser(input: {
  id?: string;
  name: string;
  login: string;
  password: string;
  locationId: string;
}) {
  try {
    const current = input.id ? await getDb().employees.get(input.id) : undefined;
    const person = await savePerson({
      id: input.id,
      name: input.name,
      locationId: input.locationId,
      podeCaixa: current ? personCanCash(current) && personLocation(current) === input.locationId : isStore(input.locationId),
      podeConsumo: true,
      login: input.login,
      password: input.password,
    });
    return asConsumeUser(person);
  } catch (err) {
    throw err instanceof PeopleError ? new ConsumeError(err.message) : err;
  }
}

export async function removeConsumeUser(id: string) {
  const person = await getDb().employees.get(id);
  if (!person) throw new ConsumeError("Funcionário não encontrado.");
  try {
    if (person.podeCaixa) {
      await savePerson({
        id: person.id,
        name: person.name,
        locationId: personLocation(person),
        podeCaixa: true,
        podeConsumo: false,
        login: person.login,
        password: person.password,
      });
      return;
    }
    await deactivatePerson(id);
  } catch (err) {
    throw err instanceof PeopleError ? new ConsumeError(err.message) : err;
  }
}

export async function authenticateConsumeUser(input: { locationId: string; login: string; password: string }) {
  const login = normalizeLogin(input.login);
  const password = input.password.trim();
  if (!login || !password) throw new ConsumeError("Informe a identificação e a senha.");

  const people = await getDb().employees.toArray();
  const person = people.find(
    (row) => row.active && personCanConsume(row) && normalizeLogin(row.login ?? "") === login,
  );
  if (!person) throw new ConsumeError("Identificação não encontrada.");
  const workplace = personLocation(person);
  const samePlace = workplace === input.locationId;
  const factoryAtStore = isFactoryConsumeStaff(workplace) && isStore(input.locationId);
  if (!samePlace && !factoryAtStore) {
    throw new ConsumeError("Este funcionário não está habilitado neste local.");
  }
  if (person.password !== password) throw new ConsumeError("Senha incorreta.");
  return asConsumeUser(person);
}

export async function userConsumptionOnDay(userId: string, dayKey = todayDate()) {
  const rows = await getDb().consumptions.where("dayKey").equals(dayKey).toArray();
  return rows.filter((row) => row.userId === userId);
}

export async function listAllowances() {
  const [rows, catalog] = await Promise.all([getDb().internalAllowances.toArray(), catalogItems(false)]);
  const byNiche = new Map(rows.map((row) => [row.nicheId, row]));
  return catalog.map((item) => ({
    ...item,
    allowance: byNiche.get(item.niche.id) ?? {
      id: item.niche.id,
      nicheId: item.niche.id,
      enabled: false,
      dailyLimit: 0,
      personLimit: 0,
    },
  }));
}

export function personDailyCap(allowance: Pick<InternalAllowance, "dailyLimit" | "personLimit">) {
  const store = Math.max(0, Math.floor(allowance.dailyLimit));
  const person =
    allowance.personLimit != null && allowance.personLimit > 0
      ? Math.floor(allowance.personLimit)
      : Math.min(1, store);
  return store > 0 ? Math.min(person, store) : person;
}

export async function saveAllowance(input: InternalAllowance) {
  const dailyLimit = Math.max(0, Math.floor(input.dailyLimit));
  const personLimit = Math.max(0, Math.floor(input.personLimit ?? 0));
  if (input.enabled && dailyLimit <= 0) {
    throw new ConsumeError("Informe quantas unidades a loja pode consumir por dia.");
  }
  if (input.enabled && personLimit <= 0) {
    throw new ConsumeError("Informe o teto de cada pessoa neste produto.");
  }
  await getDb().internalAllowances.put({
    id: input.nicheId,
    nicheId: input.nicheId,
    enabled: input.enabled,
    dailyLimit,
    personLimit: input.enabled ? Math.min(personLimit, dailyLimit) : personLimit,
  });
}

export async function consumedToday(locationId: string, nicheId: string, dayKey = todayDate()) {
  const rows = await getDb().consumptions.where("dayKey").equals(dayKey).toArray();
  return rows
    .filter((row) => row.locationId === locationId && row.nicheId === nicheId)
    .reduce((sum, row) => sum + row.qty, 0);
}

export async function consumedTodayByUser(userId: string, nicheId: string, dayKey = todayDate()) {
  const rows = await userConsumptionOnDay(userId, dayKey);
  return rows.filter((row) => row.nicheId === nicheId).reduce((sum, row) => sum + row.qty, 0);
}

export async function registerInternalConsume(input: {
  locationId: string;
  login: string;
  password: string;
  items: { nicheId: string; qty: number }[];
}) {
  if (!isStore(input.locationId)) {
    throw new ConsumeError("A fábrica não tem consumo interno. Retire na loja.");
  }

  const session = await currentCashSession(input.locationId);
  if (!session) {
    throw new ConsumeError("Abra o caixa desta loja antes do consumo interno.");
  }

  const user = await authenticateConsumeUser({
    locationId: input.locationId,
    login: input.login,
    password: input.password,
  });

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) throw new ConsumeError("Escolha o que vai ser consumido.");

  const db = getDb();
  const niches = await db.niches.bulkGet(items.map((item) => item.nicheId));
  const products = await db.products.bulkGet(niches.map((niche) => niche?.productId ?? ""));
  for (const product of products) {
    if (product && !productIsLive(product)) {
      throw new ConsumeError(closedCatalogMessage(product.name));
    }
  }
  const dayKey = todayDate();
  const refId = newId();
  const at = new Date().toISOString();

  if (isFactoryConsumeStaff(user.locationId)) {
    const already = await userConsumptionOnDay(user.id, dayKey);
    if (already.length > 0) {
      const where = consumePlaceName(already[0].locationId);
      throw new ConsumeError(
        `Funcionário da fábrica já retirou a consumação de hoje (${where}). Só vale 1 vez por dia, em qualquer loja.`,
      );
    }
  }

  await db.transaction(
    "rw",
    [db.stock, db.lots, db.movements, db.consumptions, db.internalAllowances, db.niches, db.employees, db.consumeUsers],
    async () => {
      for (const item of items) {
        const allowance = await db.internalAllowances.get(item.nicheId);
        if (!allowance?.enabled) {
          throw new ConsumeError("Esse produto não está liberado para consumo interno.");
        }
        const used = await consumedToday(input.locationId, item.nicheId, dayKey);
        if (used + item.qty > allowance.dailyLimit) {
          throw new ConsumeError(
            `O limite da loja neste produto é ${allowance.dailyLimit}. Já foram ${used}.`,
          );
        }
        const personCap = personDailyCap(allowance);
        const usedByUser = await consumedTodayByUser(user.id, item.nicheId, dayKey);
        if (usedByUser + item.qty > personCap) {
          throw new ConsumeError(
            `${user.name} já pode no máximo ${personCap} deste produto hoje. Já levou ${usedByUser}.`,
          );
        }
        const chunks = await oldestLots(input.locationId, item.nicheId, item.qty, { skipExpired: true });
        for (const chunk of chunks) {
          const lot = await db.lots.get(chunk.lotId);
          const niche = await db.niches.get(item.nicheId);
          await changeStock(input.locationId, item.nicheId, chunk.lotId, -chunk.qty);
          await db.consumptions.add({
            id: newId(),
            locationId: input.locationId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: chunk.qty,
            at,
            dayKey,
            userId: user.id,
            userName: user.name,
            unitCost: lotCost(lot, niche?.costPrice ?? 0),
          });
          await db.movements.add({
            id: newId(),
            locationId: input.locationId,
            nicheId: item.nicheId,
            lotId: chunk.lotId,
            qty: -chunk.qty,
            type: "internal",
            refId,
            at,
          });
        }
      }
    },
  );

  return refId;
}

export async function listConsumptions(scope?: string) {
  const rows = await getDb().consumptions.toArray();
  return rows
    .filter((row) => !scope || scope === "admin" || scope === "factory" || row.locationId === scope)
    .sort((a, b) => b.at.localeCompare(a.at));
}
