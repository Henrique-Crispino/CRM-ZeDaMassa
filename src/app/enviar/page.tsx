"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import {
  CompactGroup,
  CompactList,
  CompactRow,
  ConfirmDialog,
  FilterChips,
  SearchField,
  StickyActionBar,
  matchesKind,
  matchesSearch,
  pickKindOptions,
  type PickKind,
} from "@/components/pick-flow";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { ReportPreview } from "@/components/ReportPreview";
import { Button, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { getLocation, getPanel, useLocationCatalog } from "@/lib/locations";
import { listTransfers, sellableQty, stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { reportRomaneio, type ReportTable } from "@/lib/reports";
import { sendToStore, StockError } from "@/lib/stock";
import { formatDate, formatTime } from "@/lib/money";
import { productIsLive } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function EnviarPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const { stores } = useLocationCatalog();
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const pending = useLiveQuery(
    () =>
      ready
        ? listTransfers({ kind: "envio" }).then((rows) => rows.filter((row) => row.status === "em_transito"))
        : [],
    [ready],
  );
  const pendingPage = usePager(pending ?? [], 6);
  const [storeId, setStoreId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState<ReportTable | null>(null);

  const expiredFactory = useMemo(
    () => (stock ?? []).reduce((sum, item) => sum + (item.expiredQty.factory ?? 0), 0),
    [stock],
  );
  const available = useMemo(
    () =>
      (stock ?? []).filter(
        (item) =>
          productIsLive(item.product) && (sellableQty(item, "factory") > 0 || (item.qty.factory ?? 0) > 0),
      ),
    [stock],
  );

  const selected = useMemo(
    () =>
      available
        .map((item) => ({ item, qty: qty[item.niche.id] ?? 0 }))
        .filter((row) => row.qty > 0),
    [available, qty],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);
  const storeName = getLocation(storeId)?.name ?? "loja";

  const visible = useMemo(() => {
    return available.filter((item) => {
      if (!matchesKind(item.product.category, kind, (qty[item.niche.id] ?? 0) > 0)) return false;
      return matchesSearch(item.label, search);
    });
  }, [available, kind, qty, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = map.get(item.product.id) ?? [];
      list.push(item);
      map.set(item.product.id, list);
    }
    return [...map.values()];
  }, [visible]);

  if (panel && panel.type !== "factory") {
    return (
      <AppShell>
        <Empty
          title="Essa tela é da fábrica"
          hint="Abra o painel da Fábrica para mandar produtos para as lojas."
        />
      </AppShell>
    );
  }

  async function save() {
    if (!storeId) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      const transferId = await sendToStore({
        toLocationId: storeId,
        items: selected.map((row) => ({ nicheId: row.item.niche.id, qty: row.qty })),
        sentBy: panel?.name ?? "Fábrica",
      });
      setQty({});
      setStoreId("");
      setConfirm(false);
      setOk(`Saiu da fábrica. Está em trânsito para a ${storeName}. Imprima o romaneio para o motorista.`);
      setSheet(await reportRomaneio(transferId));
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para mandar. Confira as quantidades.");
      setConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="pb-36">
        <PageTitle
          title="Mandar para a loja"
          hint="Primeiro as quantidades. A loja só aparece na revisão — assim não manda para o lugar errado no meio da conta. O que sair da câmara fica em trânsito até a loja conferir."
        />

        {(pending ?? []).length > 0 ? (
          <div className="mb-4 rounded-3xl bg-orange-50 px-4 py-3 ring-1 ring-orange-200">
            <p className="font-extrabold text-stone-900">
              {(pending ?? []).length} envio{(pending ?? []).length === 1 ? "" : "s"} em trânsito
            </p>
            <PageBoard ref={pendingPage.listRef} size={pendingPage.size} rowMin="3.25rem" className="mt-2">
              {pendingPage.rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                  <span>
                    {row.storeName} · {row.sentQty} un. · {formatDate(row.at)} {formatTime(row.at)}
                  </span>
                  <button
                    type="button"
                    className="min-h-10 font-bold text-orange-800"
                    onClick={async () => setSheet(await reportRomaneio(row.id))}
                  >
                    Romaneio
                  </button>
                </div>
              ))}
            </PageBoard>
            <Pager
              page={pendingPage.page}
              pages={pendingPage.pages}
              total={pendingPage.total}
              onPage={pendingPage.setPage}
              word="envios"
            />
            <p className="mt-2 text-stone-600">Ainda não conta como estoque da loja. A loja confere em Receber.</p>
            <Link href="/receber" className="mt-2 inline-flex min-h-11 items-center font-bold text-orange-800">
              Ver recebimentos
            </Link>
          </div>
        ) : null}

        {expiredFactory > 0 ? (
          <div className="mb-4 rounded-3xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
            <p className="font-extrabold text-red-800">{expiredFactory} un. vencidas na fábrica</p>
            <p className="text-stone-700">Lote vencido não vai para a loja. Descarte no estoque para baixar a quantidade.</p>
            <Link href="/estoque" className="mt-2 inline-flex min-h-11 items-center font-bold text-red-700">
              Ir ao estoque
            </Link>
          </div>
        ) : null}

        <div className="mb-4 space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
        </div>

        {!available.length ? (
          <Empty
            title="A fábrica está sem estoque"
            hint="Registre a produção primeiro. Só depois dá para mandar para a loja."
            action={
              <Link
                href="/produzir"
                className="inline-flex min-h-14 items-center rounded-2xl bg-orange-600 px-5 text-lg font-bold text-white"
              >
                Registrar produção
              </Link>
            }
          />
        ) : grouped.length === 0 ? (
          <Empty title="Nada com esse nome" hint="Tente outro trecho ou limpe a busca." />
        ) : (
          <CompactList>
            {grouped.map((group) => (
              <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                {group.map((item) => (
                  <CompactRow
                    key={item.niche.id}
                    title={item.niche.name}
                    hint={
                      (item.expiredQty.factory ?? 0) > 0
                        ? `Válidas: ${sellableQty(item, "factory")} · ${item.expiredQty.factory} vencidas`
                        : `Na fábrica: ${item.qty.factory} un.`
                    }
                    selected={(qty[item.niche.id] ?? 0) > 0}
                  >
                    <NumberStepper
                      size="sm"
                      value={qty[item.niche.id] ?? 0}
                      max={sellableQty(item, "factory")}
                      onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                    />
                  </CompactRow>
                ))}
              </CompactGroup>
            ))}
          </CompactList>
        )}
      </div>

      <StickyActionBar>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selected.length > 0
              ? `${selected.length} tipos · ${selectedUnits} un. · a loja entra na revisão`
              : "Monte as quantidades acima"}
          </p>
          <Button disabled={selected.length === 0} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e mandar
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title={storeId ? `Mandar para a ${storeName}?` : "Para qual loja?"}
        hint="Escolha a loja agora. Entra no estoque dela só depois que ela conferir."
        confirmLabel="Confirmar e mandar"
        confirmDisabled={!storeId}
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <p className="mb-2 text-base font-bold text-stone-800">Destino</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {stores.map((store) => (
            <Button
              key={store.id}
              type="button"
              variant={storeId === store.id ? "primary" : "ghost"}
              className="min-h-12"
              onClick={() => setStoreId(store.id)}
            >
              {store.name}
            </Button>
          ))}
        </div>
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {selected.map((row) => (
            <li key={row.item.niche.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">{row.item.label}</span>
              <span className="font-extrabold">{row.qty} un.</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-lg font-extrabold text-stone-900">Total: {selectedUnits} unidades</p>
      </ConfirmDialog>
      {sheet ? <ReportPreview report={sheet} onClose={() => setSheet(null)} closeLabel="Voltar" /> : null}
    </AppShell>
  );
}
