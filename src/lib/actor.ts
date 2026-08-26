import { getDb } from "./db";
import { getActorId } from "./session";

export class ActorError extends Error {}

let overrideActorId: string | null = null;

export function peekActorId(explicit?: string | null) {
  return (explicit ?? overrideActorId ?? getActorId())?.trim() || null;
}

export function requireActorId(explicit?: string | null) {
  const id = peekActorId(explicit);
  if (!id) throw new ActorError("Falta quem está operando. Volte à porta.");
  return id;
}

export async function stampActor(ErrorClass: new (message: string) => Error, explicit?: string | null) {
  let actorId: string;
  try {
    actorId = requireActorId(explicit);
  } catch (err) {
    if (err instanceof ActorError) throw new ErrorClass(err.message);
    throw err;
  }
  let person: { id: string; name: string; active?: boolean } | undefined;
  try {
    person = await getDb().employees.get(actorId);
  } catch {
    return { actorId, actorName: actorId };
  }
  if (!person?.active) {
    throw new ErrorClass("Quem opera não está mais na Equipe.");
  }
  return { actorId: person.id, actorName: person.name };
}

export async function peopleNameMap() {
  const rows = await getDb().employees.toArray();
  return new Map(rows.map((person) => [person.id, person.name]));
}

export function fichaName(
  names: Map<string, string>,
  id?: string | null,
  copy?: string | null,
) {
  const key = id?.trim() ?? "";
  if (key && names.has(key)) return names.get(key)!;
  const text = copy?.trim() ?? "";
  return text || "—";
}

export function uniqueFichaNames(
  names: Map<string, string>,
  rows: { id?: string | null; copy?: string | null }[],
) {
  const list: string[] = [];
  for (const row of rows) {
    const name = fichaName(names, row.id, row.copy);
    if (name !== "—" && !list.includes(name)) list.push(name);
  }
  return list.length ? list.join(" · ") : "—";
}

export async function listWitnesses(operatorId?: string | null) {
  const skip = (operatorId ?? peekActorId())?.trim() ?? "";
  const rows = await getDb().employees.toArray();
  return rows
    .filter((person) => person.active && person.id !== skip)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function assertWitness(
  ErrorClass: new (message: string) => Error,
  input: { personId?: string; pin?: string },
) {
  let operatorId: string;
  try {
    operatorId = requireActorId();
  } catch (err) {
    if (err instanceof ActorError) throw new ErrorClass(err.message);
    throw err;
  }
  const personId = input.personId?.trim() ?? "";
  if (!personId) {
    throw new ErrorClass("Quem conferiu a segunda contagem? Escolha outra pessoa da Equipe.");
  }
  if (personId === operatorId) {
    throw new ErrorClass("A segunda contagem é de outra pessoa. Quem opera não confere o próprio número.");
  }
  const person = await getDb().employees.get(personId);
  if (!person?.active) {
    throw new ErrorClass("Essa ficha não está na Equipe.");
  }
  const expected = person.password?.trim() ?? "";
  if (expected.length < 4) {
    throw new ErrorClass(`${person.name} ainda não tem PIN. O Yokota cadastra na Equipe.`);
  }
  if ((input.pin ?? "").trim() !== expected) {
    throw new ErrorClass("PIN de quem conferiu não confere.");
  }
  return { recountedById: person.id, recountedBy: person.name };
}

export async function runAsActor<T>(actorId: string, fn: () => Promise<T>) {
  const prev = overrideActorId;
  overrideActorId = actorId;
  try {
    return await fn();
  } finally {
    overrideActorId = prev;
  }
}
