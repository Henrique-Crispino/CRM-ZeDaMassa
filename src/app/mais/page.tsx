"use client";

import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { PageTitle } from "@/components/ui";

const MORE = [
  { href: "/devolver", label: "Devolver para a fábrica", hint: "Saiu errado ou sobrou sem ser sobra do dia." },
  { href: "/consumo-interno", label: "Consumo interno", hint: "Quem da equipe retirou para comer." },
  { href: "/estoque", label: "Estoque", hint: "O que tem agora, com validade." },
  { href: "/inventario", label: "Inventário", hint: "Contar o físico e acertar o sistema." },
  { href: "/kardex", label: "Extrato do estoque", hint: "O que entrou e saiu de um produto." },
];

export default function MaisPage() {
  return (
    <AccessGate
      allow={["store"]}
      title="Mais é da loja"
      hint="A fábrica e a administração usam o menu delas. Aqui é o que não cabe no turno da loja."
    >
      <AppShell>
        <PageTitle
          title="Mais coisas da loja"
          hint="Isto não é o turno. Devolver, contar e olhar o extrato ficam aqui para não misturar com vender e caixa."
        />
        <div className="grid gap-3">
          {MORE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            >
              <p className="text-xl font-extrabold text-stone-900">{item.label}</p>
              <p className="mt-1 text-stone-600">{item.hint}</p>
            </Link>
          ))}
        </div>
      </AppShell>
    </AccessGate>
  );
}
