import { addDays } from "./money";
import type { Category } from "./types";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "salgado", label: "Salgado" },
  { id: "bebida", label: "Bebida" },
  { id: "limpeza", label: "Limpeza" },
  { id: "descartavel", label: "Descartáveis" },
  { id: "embalagem", label: "Embalagens" },
  { id: "insumo", label: "Insumos" },
];

export function isInsumo(category: Category) {
  return category === "insumo";
}

export function isSoldAtRegister(category: Category) {
  return !isInsumo(category);
}

export function saleCategories() {
  return CATEGORIES.filter((item) => isSoldAtRegister(item.id));
}

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

export function suggestedPurchaseExpiry(
  receivedAt: string,
  product: { perishable: boolean; shelfLifeDays: number },
) {
  if (!product.perishable || product.shelfLifeDays <= 0) return "";
  return addDays(receivedAt, product.shelfLifeDays);
}

export function isManufactured(category: Category) {
  return category === "salgado";
}

export function isPurchased(category: Category) {
  return !isManufactured(category);
}
