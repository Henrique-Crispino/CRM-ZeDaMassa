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

export async function runAsActor<T>(actorId: string, fn: () => Promise<T>) {
  const prev = overrideActorId;
  overrideActorId = actorId;
  try {
    return await fn();
  } finally {
    overrideActorId = prev;
  }
}
