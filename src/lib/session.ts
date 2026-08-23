const KEY = "gp-location";

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
