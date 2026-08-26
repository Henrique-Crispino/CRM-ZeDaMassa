const KEY = "gp-location";
const ACTOR_KEY = "gp-actor";

export function getLocationId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setLocationId(id: string) {
  localStorage.setItem(KEY, id);
}

export function clearLocationId() {
  localStorage.removeItem(KEY);
}

export function getActorId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTOR_KEY);
}

export function setActorId(id: string) {
  localStorage.setItem(ACTOR_KEY, id);
}

export function clearActorId() {
  localStorage.removeItem(ACTOR_KEY);
}

export function clearOperatorSession() {
  clearActorId();
  clearLocationId();
}
