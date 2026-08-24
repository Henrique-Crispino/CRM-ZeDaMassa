export type MoreItem = { href: string; label: string; hint: string };

export const STORE_MORE: MoreItem[] = [
  { href: "/devolver", label: "Devolver para a fábrica", hint: "Saiu errado ou sobrou sem ser sobra do dia." },
  { href: "/consumo-interno", label: "Consumo interno", hint: "Quem da equipe retirou para comer." },
  { href: "/estoque", label: "Estoque", hint: "O que tem agora, com validade." },
  { href: "/inventario", label: "Inventário", hint: "Contar o físico e acertar o sistema." },
  { href: "/kardex", label: "Extrato do estoque", hint: "O que entrou e saiu de um produto." },
];

export const FACTORY_MORE: MoreItem[] = [
  { href: "/devolver", label: "Conferir devoluções", hint: "A loja mandou de volta. Aceita na câmara ou descarta." },
  { href: "/produtos", label: "Produtos", hint: "Tipos, preço, validade e o que a fábrica faz." },
  { href: "/estoque", label: "Estoque", hint: "O que tem na câmara, com validade." },
  { href: "/inventario", label: "Inventário", hint: "Contar o físico e acertar o sistema." },
  { href: "/kardex", label: "Extrato do estoque", hint: "O que entrou e saiu de um produto." },
];

export const STORE_MORE_HREFS = ["/mais", ...STORE_MORE.map((item) => item.href)];
export const FACTORY_MORE_HREFS = ["/mais", ...FACTORY_MORE.map((item) => item.href)];

export function moreActive(pathname: string, hrefs: string[]) {
  return hrefs.some((href) => href !== "/mais" && (pathname === href || pathname.startsWith(`${href}/`)));
}
