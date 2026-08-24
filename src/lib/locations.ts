import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import type { StoreRecord } from "./types";

export type LocationType = "factory" | "store";
export type PanelType = "admin" | "factory" | "store";

export type Location = {
  id: string;
  name: string;
  shortName: string;
  type: LocationType;
};

export type Panel = {
  id: string;
  name: string;
  shortName: string;
  type: PanelType;
  hint: string;
};

export const FACTORY_LOCATION: Location = {
  id: "factory",
  name: "Fábrica",
  shortName: "Fábrica",
  type: "factory",
};

export const ADMIN_PANEL: Panel = {
  id: "admin",
  name: "Administração",
  shortName: "Admin",
  type: "admin",
  hint: "Vê fábrica e todas as lojas juntas.",
};

export const FACTORY_PANEL: Panel = {
  id: "factory",
  name: "Fábrica",
  shortName: "Fábrica",
  type: "factory",
  hint: "Produzir e mandar para as lojas.",
};

export const DEFAULT_STORES: StoreRecord[] = [
  {
    id: "store_1",
    name: "Loja Centro",
    shortName: "Centro",
    address: "Rua das Flores, 120 — Centro",
    phone: "(11) 3333-1001",
    active: true,
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "store_2",
    name: "Loja Jardim",
    shortName: "Jardim",
    address: "Av. Brasil, 850 — Jardim América",
    phone: "(11) 3333-2002",
    active: true,
    createdAt: "2026-07-01T10:00:00.000Z",
  },
];

function toLocation(store: StoreRecord): Location {
  return { id: store.id, name: store.name, shortName: store.shortName, type: "store" };
}

function toPanel(store: StoreRecord): Panel {
  return {
    id: store.id,
    name: store.name,
    shortName: store.shortName,
    type: "store",
    hint: store.id === "store_1" ? "Balcão do centro. Venda e caixa." : "Balcão do Jardim. Venda e caixa.",
  };
}

let allStores: StoreRecord[] = [...DEFAULT_STORES];
export let LOCATIONS: Location[] = [FACTORY_LOCATION, ...DEFAULT_STORES.map(toLocation)];
export let PANELS: Panel[] = [ADMIN_PANEL, FACTORY_PANEL, ...DEFAULT_STORES.map(toPanel)];

type CatalogSnapshot = {
  locations: Location[];
  panels: Panel[];
  stores: Location[];
};

let snapshot: CatalogSnapshot = {
  locations: LOCATIONS,
  panels: PANELS,
  stores: LOCATIONS.filter((item) => item.type === "store"),
};

const listeners = new Set<() => void>();

function publish() {
  snapshot = {
    locations: LOCATIONS,
    panels: PANELS,
    stores: LOCATIONS.filter((item) => item.type === "store"),
  };
  listeners.forEach((listener) => listener());
}

function applyStores(stores: StoreRecord[]) {
  allStores = stores;
  const active = stores
    .filter((store) => store.active)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  LOCATIONS = [FACTORY_LOCATION, ...active.map(toLocation)];
  PANELS = [ADMIN_PANEL, FACTORY_PANEL, ...active.map(toPanel)];
  publish();
}

export async function refreshLocations() {
  const db = getDb();
  let stores = await db.stores.toArray();
  if (stores.length === 0) {
    await db.stores.bulkAdd(DEFAULT_STORES);
    stores = [...DEFAULT_STORES];
  }
  applyStores(stores);
  return LOCATIONS;
}

export function getLocation(id: string) {
  if (id === "factory") return FACTORY_LOCATION;
  const active = LOCATIONS.find((item) => item.id === id);
  if (active) return active;
  const stored = allStores.find((item) => item.id === id);
  return stored ? toLocation(stored) : undefined;
}

export function getPanel(id: string) {
  if (id === "admin") return ADMIN_PANEL;
  if (id === "factory") return FACTORY_PANEL;
  return PANELS.find((item) => item.id === id) ?? (getLocation(id)?.type === "store"
    ? toPanel({
        id,
        name: getLocation(id)?.name ?? "Loja",
        shortName: getLocation(id)?.shortName ?? "Loja",
        address: "",
        phone: "",
        active: true,
        createdAt: "",
      })
    : undefined);
}

export function storeLocations() {
  return LOCATIONS.filter((item) => item.type === "store");
}

export function allStoreRecords() {
  return allStores;
}

export function isAdmin(id: string | null) {
  return id === "admin";
}

export function isFactory(id: string | null) {
  return id === "factory";
}

export function isStore(id: string | null) {
  if (!id || id === "admin" || id === "factory") return false;
  return getLocation(id)?.type === "store";
}

export function subscribeLocationCatalog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocationSnapshot() {
  return snapshot;
}

export function useLocationCatalog() {
  return useSyncExternalStore(subscribeLocationCatalog, getLocationSnapshot, getLocationSnapshot);
}
