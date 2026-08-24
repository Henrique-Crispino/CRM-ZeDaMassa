"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, Field, Input, PageTitle } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getPanel, useLocationCatalog } from "@/lib/locations";
import { addDays, endOfDayIso, formatDate, formatTime, startOfDayIso, todayDate } from "@/lib/money";
import { catalogItems, loadKardex } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function KardexPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const { locations } = useLocationCatalog();
  const catalog = useLiveQuery(() => (ready ? catalogItems(false) : []), [ready]);

  const storeLocked = panel?.type === "store";
  const [pickedPlace, setPickedPlace] = useState(storeLocked ? (panelId ?? "") : "factory");
  const locationId = storeLocked ? (panelId ?? "") : pickedPlace;
  const [nicheId, setNicheId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(addDays(todayDate(), -6));
  const [to, setTo] = useState(todayDate());

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? []).filter((item) => !q || item.label.toLowerCase().includes(q));
  }, [catalog, search]);
  const productPage = usePager(products, 12, search);

  const chosen = (catalog ?? []).find((item) => item.niche.id === nicheId);

  const extract = useLiveQuery(
    () =>
      ready && nicheId
        ? loadKardex({
            nicheId,
            locationId: locationId || undefined,
            from: startOfDayIso(from),
            to: endOfDayIso(to),
          })
        : undefined,
    [ready, nicheId, locationId, from, to],
  );
  const movePage = usePager(extract?.rows ?? [], 10, `${nicheId}:${from}:${to}:${locationId}`);

  return (
    <AppShell>
      <PageTitle
        title="Extrato do estoque"
        hint="O que entrou e saiu: quem tirou, quem pôs, em qual lote e quando. Escolha o produto e o local."
      />

      {!storeLocked ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {locations.map((location) => (
            <Button
              key={location.id}
              type="button"
              variant={locationId === location.id ? "primary" : "ghost"}
              onClick={() => setPickedPlace(location.id)}
            >
              {location.name}
            </Button>
          ))}
        </div>
      ) : (
        <Card className="mb-5 bg-orange-50 ring-orange-200">
          <p className="font-extrabold text-stone-900">Só o estoque desta loja</p>
          <p className="text-stone-600">A loja vê o próprio movimento. Fábrica e admin veem todos os locais.</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="De">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>

      <div className="mb-4">
        <SearchField value={search} onChange={setSearch} placeholder="Procurar produto..." />
      </div>

      <div ref={productPage.listRef} className="mb-6 scroll-mt-36">
        <div className="flex flex-wrap gap-2">
          {productPage.rows.map((item) => (
            <Button
              key={item.niche.id}
              type="button"
              variant={nicheId === item.niche.id ? "secondary" : "ghost"}
              className="min-h-11 text-sm"
              onClick={() => setNicheId(item.niche.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Pager
          page={productPage.page}
          pages={productPage.pages}
          total={productPage.total}
          onPage={productPage.setPage}
          word="produtos"
        />
      </div>

      {!nicheId ? (
        <Empty title="Escolha o produto" hint="Toque no nome. Aí aparece o extrato deste local no período." />
      ) : !extract ? (
        <Card>
          <p className="font-bold text-stone-500">Montando o extrato...</p>
        </Card>
      ) : (
        <>
          <Card className="mb-4 bg-orange-50 ring-orange-200">
            <p className="text-xl font-extrabold text-stone-900">{chosen?.label ?? extract.label}</p>
            <p className="text-stone-600">
              {formatDate(from)} a {formatDate(to)}
              {extract.opening != null ? ` · saldo inicial ${extract.opening} · final ${extract.closing}` : ""}
            </p>
          </Card>

          {extract.rows.length === 0 ? (
            <Empty title="Nenhum movimento neste recorte" hint="Mude as datas ou escolha outro produto." />
          ) : (
            <>
              <div ref={movePage.listRef} className="scroll-mt-36">
              <ul className="space-y-3">
                {movePage.rows.map((row) => (
                  <li key={row.id}>
                    <Card className={row.qty < 0 ? "ring-1 ring-red-100" : undefined}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-extrabold text-stone-900">{row.typeLabel}</p>
                          <p className="font-semibold text-stone-600">
                            {formatDate(row.at)} · {formatTime(row.at)} · {row.locationName}
                          </p>
                          <p className="text-sm font-semibold text-stone-500">{row.lotHint}</p>
                          <p className="mt-1 font-bold text-stone-800">{row.who}</p>
                          {row.note ? <p className="text-sm font-semibold text-stone-500">{row.note}</p> : null}
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-extrabold ${row.qty < 0 ? "text-red-700" : "text-emerald-800"}`}>
                            {row.qty > 0 ? `+${row.qty}` : row.qty}
                          </p>
                          {row.balance != null ? (
                            <p className="text-sm font-bold text-stone-500">Saldo {row.balance}</p>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
              </div>
              <Pager
                page={movePage.page}
                pages={movePage.pages}
                total={movePage.total}
                onPage={movePage.setPage}
                word="movimentos"
              />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
