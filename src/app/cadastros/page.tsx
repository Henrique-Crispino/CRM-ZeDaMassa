"use client";

import Link from "next/link";
import { Coffee, Contact, Store, Tag, Users } from "lucide-react";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { PageTitle } from "@/components/ui";

const items = [
  {
    href: "/lojas",
    title: "Lojas",
    hint: "Nome, endereço e telefone de cada ponto de venda.",
    icon: Store,
  },
  {
    href: "/funcionarios",
    title: "Equipe",
    hint: "Uma ficha: quem abre o caixa e quem retira consumo interno.",
    icon: Users,
  },
  {
    href: "/promocoes",
    title: "Promoções",
    hint: "Preço de um produto ou combo de vários, com início e fim.",
    icon: Tag,
  },
  {
    href: "/consumo",
    title: "Consumo interno",
    hint: "A equipe é a mesma da ficha. Aqui liberam-se produtos e senha de consumo.",
    icon: Coffee,
  },
  {
    href: "/clientes",
    title: "Clientes",
    hint: "Festa ou compra na fábrica. Nome, telefone e recado. Sem nota e sem crédito.",
    icon: Contact,
  },
];

export default function CadastrosPage() {
  return (
    <AccessGate
      allow={["admin"]}
      title="Cadastros só a administração altera"
      hint="Loja, equipe, promoção, consumo interno e clientes leves ficam neste menu."
    >
      <AppShell>
        <PageTitle
          title="Organização"
          hint="Tudo que a administração configura uma vez e a operação usa no dia a dia."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block h-full rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 transition hover:ring-orange-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
              >
                <Icon className="size-8 text-orange-600" />
                <h2 className="mt-3 text-2xl font-extrabold text-stone-900">{item.title}</h2>
                <p className="mt-1 text-lg text-stone-600">{item.hint}</p>
              </Link>
            );
          })}
        </div>
      </AppShell>
    </AccessGate>
  );
}
