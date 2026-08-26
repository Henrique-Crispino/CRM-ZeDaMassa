import { getDb } from "./db";
import { ADMIN_PANEL, FACTORY_LOCATION, isStore, storeLocations } from "./locations";
import { newId } from "./money";
import type { ConsumeUser, Employee, InternalConsumption } from "./types";

export class PeopleError extends Error {}

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

export function personLocation(person: Pick<Employee, "locationId" | "storeId">) {
  return person.locationId || person.storeId;
}

export function isAdminWorkplace(locationId: string) {
  return locationId === "admin";
}

export function isPeopleDesk(locationId: string) {
  return locationId === "factory" || isAdminWorkplace(locationId);
}

export function peopleWorkplaces() {
  return [
    { id: ADMIN_PANEL.id, name: ADMIN_PANEL.name },
    { id: FACTORY_LOCATION.id, name: FACTORY_LOCATION.name },
    ...storeLocations().map((place) => ({ id: place.id, name: place.name })),
  ];
}

export function personCanCash(person: Employee) {
  if (person.podeCaixa === false) return false;
  const place = personLocation(person);
  if (isStore(place)) return true;
  return isAdminWorkplace(place) && person.podeCaixa === true;
}

export function personCoversStore(person: Employee, storeId: string) {
  if (!person.active || !personCanCash(person) || !isStore(storeId)) return false;
  const place = personLocation(person);
  return place === storeId || isAdminWorkplace(place);
}

export function personCanConsume(person: Employee) {
  if (person.podeConsumo === false) return false;
  if (person.podeConsumo === true) return true;
  return Boolean(person.login);
}

export function asConsumeUser(person: Employee): ConsumeUser {
  return {
    id: person.id,
    name: person.name,
    login: person.login ?? "",
    password: person.password ?? "",
    locationId: personLocation(person),
    active: person.active,
  };
}

export function personRoleHint(person: Employee) {
  const place = personLocation(person);
  if (isAdminWorkplace(place) && !personCanCash(person)) return "dono · vê o Início";
  if (isAdminWorkplace(place) && personCanCash(person)) return "gerente · admin e caixa da rede";
  const roles = [
    personCanCash(person) ? "caixa" : "",
    personCanConsume(person) ? "consumo" : "",
  ].filter(Boolean);
  return roles.length ? roles.join(" · ") : "sem papel";
}

export function personAllowedPanelIds(person: Employee) {
  if (!person.active) return [];
  const place = personLocation(person);
  if (isAdminWorkplace(place)) {
    if (personCanCash(person)) {
      return ["admin", ...storeLocations().map((store) => store.id)];
    }
    return ["admin"];
  }
  if (place === "factory") return ["factory"];
  if (isStore(place)) return [place];
  return [];
}

export function personHomePanelId(person: Employee) {
  const allowed = personAllowedPanelIds(person);
  if (allowed.includes("admin")) return "admin";
  if (allowed.includes("factory")) return "factory";
  return allowed[0] ?? "";
}

export function personCanUsePanel(person: Employee, panelId: string) {
  return personAllowedPanelIds(person).includes(panelId);
}

export function personDoorHint(person: Employee) {
  const allowed = personAllowedPanelIds(person);
  if (allowed.includes("admin") && allowed.some((id) => isStore(id))) {
    return "Administração · pode ir às lojas";
  }
  if (allowed.includes("admin")) return "Administração";
  if (allowed.includes("factory")) return "Fábrica";
  const store = storeLocations().find((item) => item.id === allowed[0]);
  return store?.name ?? "Sem lugar";
}

export async function listPeople() {
  const rows = await getDb().employees.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function mergeEmployeeRows(employees: Employee[], consumeUsers: ConsumeUser[]) {
  const people = new Map<string, Employee>();
  const consumeIdToPersonId = new Map<string, string>();

  for (const employee of employees) {
    const locationId = personLocation(employee);
    const record: Employee = {
      ...employee,
      locationId,
      storeId: isPeopleDesk(locationId) ? "" : locationId || employee.storeId,
      podeCaixa: personCanCash({ ...employee, locationId }),
      podeConsumo: personCanConsume(employee),
    };
    people.set(employee.id, record);
  }

  const byName = new Map<string, Employee>();
  for (const person of people.values()) {
    byName.set(normName(person.name), person);
  }

  for (const user of consumeUsers) {
    const existing = people.get(user.id) ?? byName.get(normName(user.name));
    if (existing) {
      existing.podeConsumo = existing.podeConsumo || user.active;
      existing.login = existing.login || user.login;
      existing.password = existing.password || user.password;
      if (!existing.locationId) existing.locationId = user.locationId;
      if (user.active) existing.active = true;
      consumeIdToPersonId.set(user.id, existing.id);
      continue;
    }
    const locationId = user.locationId;
    const record: Employee = {
      id: user.id,
      name: user.name,
      locationId,
      storeId: isPeopleDesk(locationId) ? "" : locationId,
      podeCaixa: locationId !== "factory" && user.active,
      podeConsumo: user.active,
      login: user.login,
      password: user.password,
      active: user.active,
    };
    people.set(record.id, record);
    byName.set(normName(record.name), record);
    consumeIdToPersonId.set(user.id, record.id);
  }

  return { people: [...people.values()], consumeIdToPersonId };
}

export async function syncConsumeMirror(person: Employee) {
  const db = getDb();
  if (person.active && personCanConsume(person) && person.login) {
    await db.consumeUsers.put(asConsumeUser(person));
    return;
  }
  const existing = await db.consumeUsers.get(person.id);
  if (existing) await db.consumeUsers.update(person.id, { active: false });
}

export async function savePerson(input: {
  id?: string;
  name: string;
  locationId: string;
  podeCaixa: boolean;
  podeConsumo: boolean;
  login?: string;
  password?: string;
}) {
  const name = input.name.trim();
  if (!name) throw new PeopleError("Escreva o nome da pessoa.");
  if (input.locationId !== "factory" && !isAdminWorkplace(input.locationId) && !isStore(input.locationId)) {
    throw new PeopleError("Escolha a loja, a fábrica ou a administração desta pessoa.");
  }
  if (input.locationId === "factory" && input.podeCaixa) {
    throw new PeopleError("Caixa é da loja. Quem é da fábrica não abre gaveta.");
  }
  if (!isAdminWorkplace(input.locationId) && !input.podeCaixa && !input.podeConsumo) {
    throw new PeopleError("Marque pelo menos um papel: caixa ou consumo interno.");
  }

  const db = getDb();
  const current = input.id ? await db.employees.get(input.id) : undefined;
  const login = input.podeConsumo ? normalizeLogin(input.login ?? current?.login ?? "") : current?.login;
  const password = input.password?.trim() || current?.password || "";

  if (input.podeConsumo) {
    if (!login || login.length < 3) {
      throw new PeopleError("A identificação do consumo precisa ter pelo menos 3 caracteres.");
    }
    if (!current && password.length < 4) {
      throw new PeopleError("A senha do consumo precisa ter pelo menos 4 caracteres.");
    }
    if (input.password?.trim() && password.length < 4) {
      throw new PeopleError("A senha do consumo precisa ter pelo menos 4 caracteres.");
    }
    if (!password) throw new PeopleError("Informe a senha deste funcionário.");
    const taken = (await db.employees.toArray()).find(
      (row) => row.active && row.id !== input.id && normalizeLogin(row.login ?? "") === login,
    );
    if (taken) throw new PeopleError("Já existe alguém com esta identificação.");
  }

  const record: Employee = {
    id: input.id ?? current?.id ?? newId(),
    name,
    locationId: input.locationId,
    storeId: isPeopleDesk(input.locationId) ? "" : input.locationId,
    podeCaixa: input.podeCaixa,
    podeConsumo: input.podeConsumo,
    login: input.podeConsumo ? login : current?.login,
    password: input.podeConsumo ? password : current?.password,
    active: true,
  };
  await db.employees.put(record);
  await syncConsumeMirror(record);
  return record;
}

export async function deactivatePerson(id: string) {
  const db = getDb();
  const person = await db.employees.get(id);
  if (!person) throw new PeopleError("Pessoa não encontrada.");
  const next = { ...person, active: false };
  await db.employees.put(next);
  await syncConsumeMirror(next);
}

export async function mergePeopleIfNeeded() {
  const db = getDb();
  const employees = await db.employees.toArray();
  const consumeUsers = await db.consumeUsers.toArray();
  const split = consumeUsers.some(
    (user) =>
      user.active &&
      !employees.some((employee) => employee.id === user.id) &&
      employees.some((employee) => normName(employee.name) === normName(user.name)),
  );
  const missingFields = employees.some((employee) => employee.locationId == null || employee.podeCaixa == null);
  if (!split && !missingFields) {
    for (const person of employees) {
      await syncConsumeMirror(person);
    }
    return;
  }

  const { people, consumeIdToPersonId } = mergeEmployeeRows(employees, consumeUsers);
  await db.transaction("rw", [db.employees, db.consumeUsers, db.consumptions], async () => {
    await db.employees.clear();
    if (people.length) await db.employees.bulkPut(people);
    const mirrors = people.filter((person) => person.active && personCanConsume(person) && person.login).map(asConsumeUser);
    await db.consumeUsers.clear();
    if (mirrors.length) await db.consumeUsers.bulkPut(mirrors);
    const rows = await db.consumptions.toArray();
    const updates: InternalConsumption[] = [];
    for (const row of rows) {
      const nextId = row.userId ? consumeIdToPersonId.get(row.userId) : undefined;
      if (nextId && nextId !== row.userId) updates.push({ ...row, userId: nextId });
    }
    if (updates.length) await db.consumptions.bulkPut(updates);
  });
}
