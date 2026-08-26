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

export function isClosedPackage(category: Category) {
  return category === "embalagem" || category === "descartavel";
}

export function isCleaning(category: Category) {
  return category === "limpeza";
}

export function isSoldAtRegister(category: Category) {
  return category === "salgado" || category === "bebida";
}

export function isSoldAtFactory(category: Category) {
  return category === "salgado";
}

export function notForSaleMessage(name: string, category: Category) {
  if (isClosedPackage(category)) {
    return `${name} é pacote fechado. Não vende no caixa. Abra o pacote quando for usar.`;
  }
  if (isInsumo(category)) {
    return `${name} é insumo da fábrica. Não vende no caixa.`;
  }
  if (isCleaning(category)) {
    return `${name} é de uso da loja. Não vende no caixa.`;
  }
  return `${name} não vende no caixa.`;
}

export function saleCategories() {
  return CATEGORIES.filter((item) => isSoldAtRegister(item.id));
}

export function saleKindOptions(): { id: "todos" | Category; label: string }[] {
  return [{ id: "todos", label: "Tudo" }, ...saleCategories()];
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
