import type { Category } from "./types";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "salgado", label: "Salgado" },
  { id: "bebida", label: "Bebida" },
  { id: "limpeza", label: "Limpeza" },
  { id: "descartavel", label: "Descartáveis" },
  { id: "embalagem", label: "Embalagens" },
];

export function categoryLabel(id: string) {
  return CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

export function defaultPerishable(category: Category) {
  return category === "salgado";
}

export function defaultShelfLife(category: Category) {
  if (category === "salgado") return 2;
  if (category === "bebida") return 180;
  return 0;
}

export function isManufactured(category: Category) {
  return category === "salgado";
}

export function isPurchased(category: Category) {
  return !isManufactured(category);
}
