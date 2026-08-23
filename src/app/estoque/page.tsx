"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, PageTitle } from "@/components/ui";
import { getPanel, LOCATIONS, type Location } from "@/lib/locations";
import { stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { isLowAt, minFor } from "@/lib/stock-min";
import { useReady } from "@/lib/use-ready";

function columnsFor(locations: Location[]) {
  if (locations.length <= 1) return "grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]";
  if (locations.length === 2) return "grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.7fr))]";
  return "grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))]";
}

export default function EstoquePage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const isStore = panel?.type === "store";
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const allowed = useMemo(() => {
    if (isStore && panel) return LOCATIONS.filter((location) => location.id === panel.id);
    return LOCATIONS;
  }, [isStore, panel]);

  const filter = isStore ? (panel?.id ?? "store_1") : (picked ?? "all");

  const visible = useMemo(() => {
    if (filter === "all") return allowed;
    return allowed.filter((location) => location.id === filter);
  }, [allowed, filter]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock ?? []).filter((item) => !q || item.label.toLowerCase().includes(q));
  }, [search, stock]);
  const grid = columnsFor(visible);

  return (
    <AppShell>
      <PageTitle
        title={isStore ? `Estoque da ${panel?.name}` : "Estoque"}
        hint={
          isStore
            ? "Só o que tem nesta loja. Número vermelho significa que chegou no mínimo e precisa pedir mais."
            : "Número vermelho significa que chegou no mínimo. O mínimo da fábrica é maior que o da loja."
        }
      />

      {!isStore ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={filter === "all" ? "primary" : "ghost"}
            onClick={() => setPicked("all")}
          >
            Tudo
          </Button>
          {allowed.map((location) => (
            <Button
              key={location.id}
              type="button"
              variant={filter === location.id ? "primary" : "ghost"}
              onClick={() => setPicked(location.id)}
            >
              {location.shortName}
            </Button>
          ))}
        </div>
      ) : null}

      {stock?.length ? (
        <div className="mb-5">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar produto no estoque..." />
        </div>
      ) : null}

      {!stock?.length ? (
        <Empty
          title="Nenhum produto cadastrado"
          hint="Cadastre os produtos para começar a ver o estoque."
        />
      ) : rows.length === 0 ? (
        <Empty title="Nada com esse nome" hint="Tente outro trecho: coxinha, mini, coca." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200 md:block">
            <div
              className={`grid ${grid} bg-stone-100 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-stone-600`}
            >
              <span>Produto</span>
              {visible.map((location) => (
                <span key={location.id} className="text-right">
                  {location.shortName}
                </span>
              ))}
            </div>
            {rows.map((item) => (
              <div
                key={item.niche.id}
                className={`grid ${grid} items-center border-t border-stone-100 px-4 py-4`}
              >
                <div>
                  <p className="font-extrabold text-stone-900">{item.product.name}</p>
                  <p className="text-stone-600">{item.niche.name}</p>
                </div>
                {visible.map((location) => {
                  const qty = item.qty[location.id] ?? 0;
                  const low = isLowAt(location, item.niche, qty);
                  return (
                    <p
                      key={location.id}
                      className={`text-right text-xl font-extrabold ${low ? "text-red-600" : "text-stone-900"}`}
                    >
                      {qty}
                      <span className="block text-xs font-semibold text-stone-400">
                        mín. {minFor(location, item.niche)}
                      </span>
                    </p>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((item) => (
              <Card key={`m-${item.niche.id}`}>
                <p className="font-extrabold text-stone-900">{item.label}</p>
                <div className={`mt-3 grid gap-2 text-center ${visible.length > 1 ? "grid-cols-3" : "grid-cols-1"}`}>
                  {visible.map((location) => {
                    const qty = item.qty[location.id] ?? 0;
                    const low = isLowAt(location, item.niche, qty);
                    return (
                      <div key={location.id}>
                        <p className="text-sm font-bold text-stone-500">
                          {visible.length > 1 ? location.shortName : "Quantidade"}
                          <span className="block font-semibold text-stone-400">
                            mín. {minFor(location, item.niche)}
                          </span>
                        </p>
                        <p className={`text-2xl font-extrabold ${low ? "text-red-600" : "text-stone-900"}`}>
                          {qty}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
