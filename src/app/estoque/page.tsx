"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { LotExpiryBoard } from "@/components/LotExpiryBoard";
import { ConfirmDialog, SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, PageTitle, SegmentedControl, SuccessBox } from "@/components/ui";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { getPanel, useLocationCatalog, type Location } from "@/lib/locations";
import { formatDate } from "@/lib/money";
import { expiryAlertsFor, stockByLocation, stockQtyTotal, type ExpiryAlert } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { discardExpiredLots, StockError } from "@/lib/stock";
import { isLowAt, minFor } from "@/lib/stock-min";
import { productIsLive } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

function columnsFor(locations: Location[]) {
  return `grid-cols-[minmax(12rem,1.4fr)_repeat(${Math.max(1, locations.length)},minmax(5rem,0.7fr))]`;
}

export default function EstoquePage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const { locations } = useLocationCatalog();
  const stock = useLiveQuery(() => (ready ? stockByLocation() : undefined), [ready]);
  const expiry = useLiveQuery(
    () => (ready ? expiryAlertsFor(panel?.type === "store" ? panel.id : "admin") : undefined),
    [ready, panel?.id, panel?.type],
  );
  const isStore = panel?.type === "store";
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"qty" | "lots">("qty");
  const [openedLots, setOpenedLots] = useState(false);
  const [pending, setPending] = useState<ExpiryAlert[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const allowed = useMemo(() => {
    if (isStore && panel) return locations.filter((location) => location.id === panel.id);
    return locations;
  }, [isStore, panel, locations]);

  const filter = isStore ? (panel?.id ?? "store_1") : (picked ?? "all");

  const visible = useMemo(() => {
    if (filter === "all") return allowed;
    return allowed.filter((location) => location.id === filter);
  }, [allowed, filter]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock ?? []).filter((item) => {
      if (q && !item.label.toLowerCase().includes(q)) return false;
      if (!productIsLive(item.product) && stockQtyTotal(item.qty) <= 0) return false;
      return true;
    });
  }, [search, stock]);
  const stockPage = usePager(rows, 10, `${search}:${filter}:${view}`);
  const grid = columnsFor(visible);
  useEffect(() => {
    if (openedLots) return;
    if ((expiry ?? []).some((item) => item.level === "expired")) {
      setView("lots");
      setOpenedLots(true);
    }
  }, [expiry, openedLots]);

  const expiryVisible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expiry ?? []).filter((item) => {
      if (filter !== "all" && item.locationId !== filter) return false;
      if (q && !item.label.toLowerCase().includes(q) && !item.locationName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expiry, filter, search]);

  async function confirmDiscard() {
    if (!pending?.length) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      await discardExpiredLots({
        items: pending.map((item) => ({
          locationId: item.locationId,
          nicheId: item.nicheId,
          lotId: item.lotId,
          qty: item.qty,
        })),
      });
      const units = pending.reduce((sum, item) => sum + item.qty, 0);
      setOk(`${units} unidades vencidas saíram do estoque.`);
      setPending(null);
      if (view !== "lots") setView("lots");
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para descartar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title={isStore ? `Estoque da ${panel?.name}` : "Estoque"}
          hint="Quantidade de um lado. Validade e descarte dos lotes vencidos do outro."
        />
        <Link
          href="/kardex"
          className="inline-flex min-h-12 items-center rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300"
        >
          Ver extrato
        </Link>
      </div>

      <div className="mb-5">
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { id: "qty", label: "Quantidades" },
            { id: "lots", label: (expiry?.length ?? 0) > 0 ? `Validade (${expiry?.length})` : "Validade" },
          ]}
        />
      </div>

      {!isStore ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button type="button" variant={filter === "all" ? "primary" : "ghost"} onClick={() => setPicked("all")}>
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
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={view === "lots" ? "Buscar produto ou local..." : "Buscar produto no estoque..."}
          />
        </div>
      ) : null}

      <ErrorBox message={error} />
      <SuccessBox message={ok} />
      {view === "qty" && (expiry ?? []).some((item) => item.level === "expired") ? (
        <button
          type="button"
          onClick={() => setView("lots")}
          className="mb-4 w-full rounded-3xl bg-red-50 px-4 py-3 text-left ring-1 ring-red-200"
        >
          <p className="font-extrabold text-red-800">Tem lote vencido no estoque</p>
          <p className="text-stone-700">Abra a validade para descartar e baixar a quantidade.</p>
        </button>
      ) : null}

      {view === "lots" ? (
        <div className="mt-4">
          <LotExpiryBoard
            items={expiryVisible}
            canDiscard
            discarding={saving}
            onDiscard={(item) => {
              setOk("");
              setPending([item]);
            }}
            onDiscardAll={(items) => {
              setOk("");
              setPending(items);
            }}
          />
        </div>
      ) : stock === undefined ? (
        <Card className="mb-4">
          <p className="font-extrabold text-stone-600">Carregando estoque...</p>
        </Card>
      ) : !stock.length ? (
        <Empty title="Nenhum produto cadastrado" hint="Cadastre os produtos para começar a ver o estoque." />
      ) : rows.length === 0 ? (
        <Empty title="Nada com esse nome" hint="Tente outro trecho: coxinha, mini, coca." />
      ) : (
        <>
          <div ref={stockPage.listRef} className="scroll-mt-36">
          <div className="hidden min-h-[40rem] overflow-x-auto rounded-3xl bg-white ring-1 ring-stone-200 md:block">
            <div
              className={`grid min-w-[640px] ${grid} bg-stone-100 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-stone-600`}
            >
              <span>Produto</span>
              {visible.map((location) => (
                <span key={location.id} className="text-right">
                  {location.shortName}
                </span>
              ))}
            </div>
            {stockPage.rows.map((item) => (
              <div
                key={item.niche.id}
                className={`grid min-w-[640px] ${grid} items-center border-t border-stone-100 px-4 py-4`}
              >
                <div>
                  <p className="font-extrabold text-stone-900">{item.product.name}</p>
                  <p className="text-stone-600">{item.niche.name}</p>
                </div>
                {visible.map((location) => {
                  const qty = item.qty[location.id] ?? 0;
                  const expired = item.expiredQty[location.id] ?? 0;
                  const sellable = Math.max(0, qty - expired);
                  const low = isLowAt(location, item.niche, sellable);
                  return (
                    <p
                      key={location.id}
                      className={`text-right text-xl font-extrabold ${expired > 0 || low ? "text-red-600" : "text-stone-900"}`}
                    >
                      {qty}
                      <span className="block text-xs font-semibold text-stone-400">
                        mín. {minFor(location, item.niche)}
                        {expired > 0 ? ` · ${expired} venc.` : ""}
                      </span>
                    </p>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="md:hidden">
            <PageBoard size={stockPage.size} rowMin="8.5rem">
              {stockPage.rows.map((item) => (
              <Card key={`m-${item.niche.id}`}>
                <p className="font-extrabold text-stone-900">{item.label}</p>
                <div className={`mt-3 grid gap-2 text-center ${visible.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {visible.map((location) => {
                    const qty = item.qty[location.id] ?? 0;
                    const expired = item.expiredQty[location.id] ?? 0;
                    const sellable = Math.max(0, qty - expired);
                    const low = isLowAt(location, item.niche, sellable);
                    return (
                      <div key={location.id}>
                        <p className="text-sm font-bold text-stone-500">
                          {visible.length > 1 ? location.shortName : "Quantidade"}
                          <span className="block font-semibold text-stone-400">
                            mín. {minFor(location, item.niche)}
                            {expired > 0 ? ` · ${expired} venc.` : ""}
                          </span>
                        </p>
                        <p className={`text-2xl font-extrabold ${expired > 0 || low ? "text-red-600" : "text-stone-900"}`}>
                          {qty}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
            </PageBoard>
          </div>
          </div>
          <Pager
            page={stockPage.page}
            pages={stockPage.pages}
            total={stockPage.total}
            onPage={stockPage.setPage}
            word="produtos"
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending?.length)}
        title={pending?.length === 1 ? "Descartar este lote vencido?" : "Descartar todos os vencidos?"}
        hint="Isso tira do estoque, entra como perda por validade e some das métricas de quantidade."
        confirmLabel="Descartar e baixar estoque"
        busy={saving}
        onConfirm={confirmDiscard}
        onCancel={() => setPending(null)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {(pending ?? []).map((item) => (
            <li key={`${item.locationId}-${item.lotId}`} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">
                {item.qty}× {item.label}
                <span className="block text-sm font-semibold text-stone-500">
                  {item.locationName} · venceu {formatDate(item.expiresAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </AppShell>
  );
}
