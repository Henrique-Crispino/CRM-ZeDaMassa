"use client";

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
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { formatDate, formatTime } from "@/lib/money";
import { listTransfers, sellableQty, stockByLocation, type TransferView } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { receiveReturn, returnToFactory, StockError } from "@/lib/stock";
import { RETURN_REASONS, type ReturnReason } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function DevolverPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const isStore = panel?.type === "store";

  if (!ready || !panel || !panelId) {
    return (
      <AppShell>
        <p className="text-xl font-bold text-stone-500">Carregando...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {isStore ? <StoreReturn locationId={panelId} /> : <FactoryReturn />}
    </AppShell>
  );
}

function StoreReturn({ locationId }: { locationId: string }) {
  const ready = useReady();
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const mine = useLiveQuery(
    () => (ready ? listTransfers({ fromLocationId: locationId, kind: "devolucao" }) : []),
    [ready, locationId],
  );
  const minePage = usePager(mine ?? [], 8, locationId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>("excedente");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const available = useMemo(() => {
    return (stock ?? []).filter((item) => {
      const sellable = sellableQty(item, locationId);
      const total = item.qty[locationId] ?? 0;
      return reason === "qualidade" ? total > 0 : sellable > 0;
    });
  }, [stock, locationId, reason]);

  const selected = useMemo(
    () => available.map((item) => ({ item, qty: qty[item.niche.id] ?? 0 })).filter((row) => row.qty > 0),
    [available, qty],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);

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

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await returnToFactory({
        fromLocationId: locationId,
        reason,
        items: selected.map((row) => ({ nicheId: row.item.niche.id, qty: row.qty })),
      });
      setQty({});
      setConfirm(false);
      setOk("Saiu da loja. Está a caminho da fábrica — não é sobra.");
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para devolver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-52">
      <PageTitle
        title="Devolver para a fábrica"
        hint="Lote errado, excedente ou qualidade. Sai da loja agora. A fábrica decide se volta à câmara ou se descarta — sem lançar sobra falsa."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {RETURN_REASONS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={reason === item.id ? "primary" : "ghost"}
            onClick={() => setReason(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 space-y-3">
        <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
        <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
      </div>

      {grouped.length === 0 ? (
        <Empty title="Nada para devolver" hint="Só aparece o que esta loja tem em estoque." />
      ) : (
        <CompactList>
          {grouped.map((group) => (
            <CompactGroup key={group[0].product.id} title={group[0].product.name}>
              {group.map((item) => {
                const max =
                  reason === "qualidade"
                    ? item.qty[locationId] ?? 0
                    : sellableQty(item, locationId);
                return (
                  <CompactRow
                    key={item.niche.id}
                    title={item.niche.name}
                    hint={
                      reason === "qualidade"
                        ? `Na loja: ${item.qty[locationId] ?? 0} un.`
                        : `Válidas: ${sellableQty(item, locationId)} un.`
                    }
                    selected={(qty[item.niche.id] ?? 0) > 0}
                  >
                    <NumberStepper
                      size="sm"
                      value={qty[item.niche.id] ?? 0}
                      max={max}
                      onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                    />
                  </CompactRow>
                );
              })}
            </CompactGroup>
          ))}
        </CompactList>
      )}

      {(mine ?? []).length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-2xl font-extrabold text-stone-900">Já devolvidas</h2>
          <div ref={minePage.listRef} className="scroll-mt-36">
          <ul className="space-y-3">
            {minePage.rows.map((row) => (
              <li key={row.id}>
                <HistoryCard row={row} />
              </li>
            ))}
          </ul>
          </div>
          <Pager
            page={minePage.page}
            pages={minePage.pages}
            total={minePage.total}
            onPage={minePage.setPage}
            word="devoluções"
          />
        </section>
      ) : null}

      <StickyActionBar>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selected.length > 0
              ? `${selected.length} tipos · ${selectedUnits} un. · ${RETURN_REASONS.find((item) => item.id === reason)?.label}`
              : "Monte as quantidades acima"}
          </p>
          <Button disabled={selected.length === 0} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e devolver
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title="Devolver para a fábrica?"
        hint="Sai do estoque desta loja agora. Não é sobra. A fábrica confere se volta à câmara ou se descarta."
        confirmLabel="Confirmar devolução"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {selected.map((row) => (
            <li key={row.item.niche.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">{row.item.label}</span>
              <span className="font-extrabold">{row.qty} un.</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-bold text-stone-700">
          Motivo: {RETURN_REASONS.find((item) => item.id === reason)?.label}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function FactoryReturn() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const transfers = useLiveQuery(() => (ready ? listTransfers({ kind: "devolucao" }) : []), [ready]);
  const [picked, setPicked] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const pending = useMemo(
    () => (transfers ?? []).filter((row) => row.status === "em_transito"),
    [transfers],
  );
  const history = useMemo(
    () => (transfers ?? []).filter((row) => row.status !== "em_transito"),
    [transfers],
  );
  const historyPage = usePager(history, 8);
  const pendingPage = usePager(pending, 6);
  const selected = pending.find((row) => row.id === picked);

  const review = useMemo(() => {
    if (!selected) return [];
    return selected.items.map((item) => {
      const accepted = draft[item.id] ?? (selected.reason === "qualidade" ? 0 : item.qty);
      return { item, accepted, discarded: item.qty - accepted };
    });
  }, [selected, draft]);
  const discardedUnits = review.reduce((sum, row) => sum + row.discarded, 0);
  const acceptedUnits = review.reduce((sum, row) => sum + row.accepted, 0);

  async function save() {
    if (!selected || !panel) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      await receiveReturn({
        transferId: selected.id,
        receivedBy: panel.name,
        items: review.map((row) => ({ id: row.item.id, acceptedQty: row.accepted })),
      });
      setConfirm(false);
      setPicked("");
      setOk(
        discardedUnits > 0
          ? `${acceptedUnits} un. voltaram à câmara. ${discardedUnits} foram descartadas — não é sobra.`
          : `${acceptedUnits} un. voltaram à câmara da fábrica.`,
      );
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para conferir esta devolução.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="Devoluções da loja"
        hint="O que a loja mandou de volta. Quantas voltam à câmara. O resto descarta — sem fingir sobra do dia."
      />
      <ErrorBox message={error} />
      <SuccessBox message={ok} />

      {pending.length === 0 && !selected ? (
        <Empty title="Nada a conferir" hint="Quando a loja devolver, aparece aqui." />
      ) : null}

      {pending.length > 0 && !selected ? (
        <div className="mb-8">
          <PageBoard ref={pendingPage.listRef} size={pendingPage.size} rowMin="9.5rem">
            {pendingPage.rows.map((row) => (
              <Card key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold text-stone-900">{row.storeName}</p>
                    <p className="font-semibold text-stone-600">
                      {row.reasonLabel} · {formatDate(row.at)} · {formatTime(row.at)} · {row.sentQty} un.
                    </p>
                    <ul className="mt-2 space-y-1 text-stone-700">
                      {row.items.slice(0, 6).map((item) => (
                        <li key={item.id} className="font-semibold">
                          {item.qty} {item.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    onClick={() => {
                      setPicked(row.id);
                      setDraft(
                        Object.fromEntries(
                          row.items.map((item) => [item.id, row.reason === "qualidade" ? 0 : item.qty]),
                        ),
                      );
                      setOk("");
                      setError("");
                    }}
                  >
                    Conferir
                  </Button>
                </div>
              </Card>
            ))}
          </PageBoard>
          <Pager
            page={pendingPage.page}
            pages={pendingPage.pages}
            total={pendingPage.total}
            onPage={pendingPage.setPage}
            word="devoluções"
          />
        </div>
      ) : null}

      {selected ? (
        <div className="mb-8">
          <Card className="mb-4">
            <p className="text-xl font-extrabold text-stone-900">
              {selected.storeName} · {selected.reasonLabel}
            </p>
            <p className="font-semibold text-stone-600">
              {selected.sentQty} un. saíram da loja. Quantas voltam à câmara?
            </p>
          </Card>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="soft"
              onClick={() => setDraft(Object.fromEntries(selected.items.map((item) => [item.id, item.qty])))}
            >
              Volta tudo à câmara
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDraft(Object.fromEntries(selected.items.map((item) => [item.id, 0])))}
            >
              Descartar tudo
            </Button>
            <Button variant="ghost" onClick={() => setPicked("")}>
              Voltar à lista
            </Button>
          </div>
          <div className="space-y-3">
            {selected.items.map((item) => {
              const accepted = draft[item.id] ?? (selected.reason === "qualidade" ? 0 : item.qty);
              const discarded = item.qty - accepted;
              return (
                <Card key={item.id} className={discarded > 0 ? "ring-1 ring-red-100" : undefined}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-stone-900">{item.label}</p>
                      <p className="text-sm font-semibold text-stone-500">{item.lotHint}</p>
                      <p className="font-semibold text-stone-600">Devolveu {item.qty} un.</p>
                      {discarded > 0 ? (
                        <p className="font-bold text-red-700">{discarded} vão para descarte</p>
                      ) : (
                        <p className="font-semibold text-emerald-800">Volta inteiro à câmara</p>
                      )}
                    </div>
                    <NumberStepper
                      value={accepted}
                      max={item.qty}
                      onChange={(value) => setDraft((current) => ({ ...current, [item.id]: value }))}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="mt-4">
            <Button onClick={() => { setError(""); setConfirm(true); }}>
              Confirmar conferência
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section>
          <h2 className="mb-3 text-2xl font-extrabold text-stone-900">Já conferidas</h2>
          <div ref={historyPage.listRef} className="scroll-mt-36">
          <ul className="space-y-3">
            {historyPage.rows.map((row) => (
              <li key={row.id}>
                <HistoryCard row={row} />
              </li>
            ))}
          </ul>
          </div>
          <Pager
            page={historyPage.page}
            pages={historyPage.pages}
            total={historyPage.total}
            onPage={historyPage.setPage}
            word="devoluções"
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title="Confirmar esta devolução?"
        hint={
          discardedUnits > 0
            ? `${acceptedUnits} voltam à câmara. ${discardedUnits} descartam — não entra como sobra da loja.`
            : "Tudo volta à câmara da fábrica."
        }
        confirmLabel="Confirmar"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {review.map((row) => (
            <li key={row.item.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">{row.item.label}</span>
              <span className="font-extrabold">
                câmara {row.accepted}
                {row.discarded > 0 ? ` · descarte ${row.discarded}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}

function HistoryCard({ row }: { row: TransferView }) {
  return (
    <Card className={row.discardedQty > 0 ? "ring-1 ring-red-100" : undefined}>
      <p className="text-lg font-extrabold text-stone-900">
        {row.storeName} · {row.reasonLabel ?? "Devolução"} · {row.statusLabel}
      </p>
      <p className="font-semibold text-stone-600">
        {formatDate(row.at)} · mandou {row.sentQty}
        {row.status !== "em_transito" ? ` · câmara ${row.arrivedQty} · descarte ${row.discardedQty}` : " · a caminho"}
        {row.receivedBy ? ` · ${row.receivedBy}` : ""}
      </p>
    </Card>
  );
}
