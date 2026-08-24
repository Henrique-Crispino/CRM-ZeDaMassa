"use client";

import Link from "next/link";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { FACTORY_MORE, STORE_MORE } from "@/components/nav";
import { PageTitle } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function MaisPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const factory = panel?.type === "factory";
  const items = factory ? FACTORY_MORE : STORE_MORE;

  return (
    <AccessGate
      allow={["store", "factory"]}
      title="Mais não é da administração"
      hint="A loja e a fábrica guardam aqui o que não cabe no turno. Relatório e cadastro ficam no menu da administração."
    >
      <AppShell>
        <PageTitle
          title={factory ? "Mais coisas da fábrica" : "Mais coisas da loja"}
          hint="O caminho do dia é o botão Mais no menu da esquerda. Esta página é a mesma lista, se alguém cair aqui."
        />
        <div className="grid gap-3">
          {items.map((item) => (
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
