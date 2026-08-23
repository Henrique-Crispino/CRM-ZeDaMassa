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

export const LOCATIONS: Location[] = [
  { id: "factory", name: "Fábrica", shortName: "Fábrica", type: "factory" },
  { id: "store_1", name: "Loja 1", shortName: "Loja 1", type: "store" },
  { id: "store_2", name: "Loja 2", shortName: "Loja 2", type: "store" },
];

export const PANELS: Panel[] = [
  {
    id: "admin",
    name: "Administração",
    shortName: "Admin",
    type: "admin",
    hint: "Vê fábrica e as duas lojas juntas.",
  },
  {
    id: "factory",
    name: "Fábrica",
    shortName: "Fábrica",
    type: "factory",
    hint: "Produzir e mandar para as lojas.",
  },
  {
    id: "store_1",
    name: "Loja 1",
    shortName: "Loja 1",
    type: "store",
    hint: "Vender e lançar a sobra do dia.",
  },
  {
    id: "store_2",
    name: "Loja 2",
    shortName: "Loja 2",
    type: "store",
    hint: "Vender e lançar a sobra do dia.",
  },
];

export function getLocation(id: string) {
  return LOCATIONS.find((item) => item.id === id);
}

export function getPanel(id: string) {
  return PANELS.find((item) => item.id === id);
}

export function storeLocations() {
  return LOCATIONS.filter((item) => item.type === "store");
}

export function isAdmin(id: string | null) {
  return id === "admin";
}

export function isFactory(id: string | null) {
  return id === "factory";
}

export function isStore(id: string | null) {
  return id === "store_1" || id === "store_2";
}
