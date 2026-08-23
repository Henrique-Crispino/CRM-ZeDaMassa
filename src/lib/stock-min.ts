import type { Location } from "./locations";
import type { Niche } from "./types";

export function factoryMin(niche: Niche) {
  return niche.minStockFactory ?? Math.max(100, (niche.minStock ?? 20) * 5);
}

export function storeMin(niche: Niche) {
  return niche.minStockStore ?? niche.minStock ?? 20;
}

export function minFor(location: Location, niche: Niche) {
  return location.type === "factory" ? factoryMin(niche) : storeMin(niche);
}

export function isLowAt(location: Location, niche: Niche, qty: number) {
  const min = minFor(location, niche);
  return min > 0 && qty <= min;
}
