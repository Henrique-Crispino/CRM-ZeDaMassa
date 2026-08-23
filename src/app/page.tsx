"use client";

import { useRouter } from "next/navigation";
import { Factory, Shield, Store } from "lucide-react";
import { DemoDataButton } from "@/components/DemoDataButton";
import { PANELS } from "@/lib/locations";
import { setLocationId } from "@/lib/session";
import { Button } from "@/components/ui";
import { useReady } from "@/lib/use-ready";

export default function HomePage() {
  const router = useRouter();
  const ready = useReady();

  return (
    <div className="min-h-screen bg-orange-50 px-4 py-10">
      <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <p className="text-lg font-bold uppercase tracking-wide text-orange-700">
          Controle da fábrica
        </p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight text-stone-900">
          Qual painel você quer abrir?
        </h1>
        <p className="mt-3 max-w-xl text-xl leading-relaxed text-stone-600">
          Cada botão abre uma tela diferente. Toque no seu lugar de trabalho.
        </p>

        {ready ? (
          <div className="mt-8 rounded-3xl bg-white p-5 ring-1 ring-stone-200">
            <p className="mb-3 text-lg font-extrabold text-stone-900">Quer ver o sistema funcionando?</p>
            <DemoDataButton variant="soft" />
          </div>
        ) : null}

        <div className="mt-10 grid gap-4">
          {PANELS.map((panel) => {
            const Icon = panel.type === "admin" ? Shield : panel.type === "factory" ? Factory : Store;
            const variant = panel.type === "admin" ? "secondary" : panel.type === "factory" ? "primary" : "ghost";
            return (
              <Button
                key={panel.id}
                className="h-auto min-h-24 w-full flex-col items-start justify-center px-6 py-5 text-left"
                variant={variant}
                onClick={() => {
                  setLocationId(panel.id);
                  router.push("/inicio");
                }}
              >
                <span className="flex items-center gap-3 text-2xl">
                  <Icon className="size-8 shrink-0" />
                  {panel.name}
                </span>
                <span className="mt-1 text-base font-semibold opacity-80">{panel.hint}</span>
              </Button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
