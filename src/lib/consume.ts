import { getDb } from "./db";
import { catalogItems } from "./queries";
import { FACTORY_LOCATION, getLocation, isStore, storeLocations } from "./locations";
import { newId, todayDate } from "./money";
import { oldestLots, changeStock } from "./stock-core";
import type { ConsumeUser, InternalAllowance } from "./types";
import { lotCost } from "./types";

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

function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

export async function listConsumeUsers(locationId?: string) {
  const rows = await getDb().consumeUsers.toArray();
  return rows
    .filter((item) => {
      if (!item.active) return false;
      if (!locationId) return true;
      if (item.locationId === locationId) return true;
      return isStore(locationId) && isFactoryConsumeStaff(item.locationId);
    })
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
  const name = input.name.trim();
  const login = normalizeLogin(input.login);
  const password = input.password.trim();
  if (!name) throw new ConsumeError("Escreva o nome do funcionário.");
  if (login.length < 3) throw new ConsumeError("A identificação precisa ter pelo menos 3 caracteres.");
  if (!input.id && password.length < 4) throw new ConsumeError("A senha precisa ter pelo menos 4 caracteres.");
  if (input.id && password && password.length < 4) {
    throw new ConsumeError("A senha precisa ter pelo menos 4 caracteres.");
  }
  if (input.locationId !== "factory" && !isStore(input.locationId)) {
    throw new ConsumeError("Escolha a loja ou a fábrica deste funcionário.");
  }

  const db = getDb();
  const current = input.id ? await db.consumeUsers.get(input.id) : undefined;
  const taken = (await db.consumeUsers.toArray()).find(
    (row) => row.active && normalizeLogin(row.login) === login && row.id !== input.id,
  );
  if (taken) throw new ConsumeError("Já existe um funcionário com esta identificação.");

  const record: ConsumeUser = {
    id: input.id ?? newId(),
    name,
    login,
    password: password || current?.password || "",
    locationId: input.locationId,
    active: true,
  };
  if (!record.password) throw new ConsumeError("Informe a senha deste funcionário.");
  await db.consumeUsers.put(record);
  return record;
}

export async function removeConsumeUser(id: string) {
  const user = await getDb().consumeUsers.get(id);
  if (!user) throw new ConsumeError("Funcionário não encontrado.");
  await getDb().consumeUsers.update(id, { active: false });
}

export async function authenticateConsumeUser(input: { locationId: string; login: string; password: string }) {
  const login = normalizeLogin(input.login);
  const password = input.password.trim();
  if (!login || !password) throw new ConsumeError("Informe a identificação e a senha.");

  const users = await getDb().consumeUsers.toArray();
  const user = users.find((row) => row.active && normalizeLogin(row.login) === login);
  if (!user) throw new ConsumeError("Identificação não encontrada.");
  const samePlace = user.locationId === input.locationId;
  const factoryAtStore = isFactoryConsumeStaff(user.locationId) && isStore(input.locationId);
  if (!samePlace && !factoryAtStore) {
    throw new ConsumeError("Este funcionário não está habilitado neste local.");
  }
  if (user.password !== password) throw new ConsumeError("Senha incorreta.");
  return user;
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
    },
  }));
}

export async function saveAllowance(input: InternalAllowance) {
  if (input.enabled && input.dailyLimit <= 0) {
    throw new ConsumeError("Informe quantas unidades podem ser consumidas por dia.");
  }
  await getDb().internalAllowances.put({
    id: input.nicheId,
    nicheId: input.nicheId,
    enabled: input.enabled,
    dailyLimit: Math.max(0, Math.floor(input.dailyLimit)),
  });
}

export async function consumedToday(locationId: string, nicheId: string, dayKey = todayDate()) {
  const rows = await getDb().consumptions.where("dayKey").equals(dayKey).toArray();
  return rows
    .filter((row) => row.locationId === locationId && row.nicheId === nicheId)
    .reduce((sum, row) => sum + row.qty, 0);
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

  const user = await authenticateConsumeUser({
    locationId: input.locationId,
    login: input.login,
    password: input.password,
  });

  const items = input.items.filter((item) => item.qty > 0);
  if (items.length === 0) throw new ConsumeError("Escolha o que vai ser consumido.");

  const db = getDb();
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
    [db.stock, db.lots, db.movements, db.consumptions, db.internalAllowances, db.niches, db.consumeUsers],
    async () => {
      for (const item of items) {
        const allowance = await db.internalAllowances.get(item.nicheId);
        if (!allowance?.enabled) {
          throw new ConsumeError("Esse produto não está liberado para consumo interno.");
        }
        const used = await consumedToday(input.locationId, item.nicheId, dayKey);
        if (used + item.qty > allowance.dailyLimit) {
          throw new ConsumeError(
            `O limite do dia deste produto é ${allowance.dailyLimit}. Já foram ${used}.`,
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
