"use client";

import { useRouter } from "next/navigation";
import { Factory, Shield, Store } from "lucide-react";
import { useLocationCatalog } from "@/lib/locations";
import { setLocationId } from "@/lib/session";
import { Button } from "@/components/ui";
import { useReady } from "@/lib/use-ready";

export default function HomePage() {
  const router = useRouter();
  useReady();
  const { panels } = useLocationCatalog();
  const admin = panels.filter((panel) => panel.type === "admin");
  const factory = panels.filter((panel) => panel.type === "factory");
  const stores = panels.filter((panel) => panel.type === "store");

  return (
    <div className="min-h-screen bg-orange-50 px-4 py-10">
      <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <p className="text-sm font-bold uppercase tracking-wide text-orange-700">
          Controle da fábrica
        </p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight text-stone-900">
          Qual painel você quer abrir?
        </h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-stone-600">
          Cada botão abre o lugar de trabalho. Os dados deste computador ficam neste navegador.
        </p>

        <div className="mt-8 space-y-3">
          {[...admin, ...factory].map((panel) => {
            const Icon = panel.type === "admin" ? Shield : Factory;
            return (
              <Button
                key={panel.id}
                className="h-auto min-h-20 w-full flex-col items-start justify-center px-6 py-5 text-left"
                variant={panel.type === "admin" ? "secondary" : "primary"}
                onClick={() => {
                  setLocationId(panel.id);
                  router.push("/inicio");
                }}
              >
                <span className="flex items-center gap-3 text-2xl">
                  <Icon className="size-7 shrink-0" />
                  {panel.name}
                </span>
                <span className="mt-1 text-base font-semibold opacity-80">{panel.hint}</span>
              </Button>
            );
          })}
        </div>

        {stores.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-extrabold text-stone-800">Lojas</h2>
            <div className="grid gap-3">
              {stores.map((panel) => (
                <Button
                  key={panel.id}
                  className="h-auto min-h-20 w-full flex-col items-start justify-center px-6 py-5 text-left"
                  variant="ghost"
                  onClick={() => {
                    setLocationId(panel.id);
                    router.push("/inicio");
                  }}
                >
                  <span className="flex items-center gap-3 text-2xl">
                    <Store className="size-7 shrink-0" />
                    {panel.name}
                  </span>
                  <span className="mt-1 text-base font-semibold text-stone-500">{panel.hint}</span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
