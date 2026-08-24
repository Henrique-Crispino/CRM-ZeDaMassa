"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog, SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getLocation, getPanel, useLocationCatalog } from "@/lib/locations";
import { formatDate, formatTime } from "@/lib/money";
import { inventorySheet } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import {
  applyInventory,
  inventoryCountDetails,
  listInventoryCounts,
  StockError,
} from "@/lib/stock";
import type { AdjustmentReason } from "@/lib/types";
import { ADJUSTMENT_REASONS, adjustmentReasonLabel } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

type Draft = {
  counted: number;
  reason: AdjustmentReason;
};

export default function InventarioPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const { locations } = useLocationCatalog();
  const [picked, setPicked] = useState("factory");
  const locationId = panel?.type === "admin" ? picked : panel?.type === "factory" ? "factory" : (panelId ?? "");
  const sheet = useLiveQuery(
    () => (ready && locationId ? inventorySheet(locationId) : []),
    [ready, locationId],
  );
  const history = useLiveQuery(
    () => (ready ? listInventoryCounts(panel?.type === "admin" ? undefined : locationId) : []),
    [ready, panel?.type, locationId],
  );
  const historyPage = usePager(history ?? [], 8, locationId);

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sheet ?? []).filter(
      (row) => !q || row.label.toLowerCase().includes(q) || row.hint.toLowerCase().includes(q),
    );
  }, [sheet, search]);

  const diffs = useMemo(() => {
    return (sheet ?? [])
      .map((row) => {
        const current = draft[row.key];
        const counted = current?.counted ?? row.systemQty;
        return {
          row,
          counted,
          reason: current?.reason ?? "contagem",
          delta: counted - row.systemQty,
        };
      })
      .filter((item) => item.delta !== 0);
  }, [sheet, draft]);

  function setCounted(key: string, systemQty: number, counted: number) {
    setDraft((current) => ({
      ...current,
      [key]: {
        counted,
        reason: current[key]?.reason ?? "contagem",
      },
    }));
    if (counted === systemQty) {
      setDraft((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  async function save() {
    if (!locationId || !panel) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      await applyInventory({
        locationId,
        countedBy: panel.name,
        lines: diffs.map((item) => ({
          nicheId: item.row.nicheId,
          lotId: item.row.lotId,
          countedQty: item.counted,
          reason: item.reason,
        })),
      });
      setDraft({});
      setConfirm(false);
      setOk(`Ajuste lançado. ${diffs.length} diferença${diffs.length === 1 ? "" : "s"} no estoque.`);
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para lançar o inventário.");
    } finally {
      setSaving(false);
    }
  }

  const placeName = getLocation(locationId)?.name ?? locationId;

  return (
    <AppShell>
      <PageTitle
        title="Inventário"
        hint="Conte o que está na câmara ou na loja. A diferença vira ajuste — não precisa fingir venda nem sobra."
      />

      {panel?.type === "admin" ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {locations.map((location) => (
            <Button
              key={location.id}
              type="button"
              variant={locationId === location.id ? "primary" : "ghost"}
              onClick={() => {
                setPicked(location.id);
                setDraft({});
                setOk("");
                setError("");
              }}
            >
              {location.name}
            </Button>
          ))}
        </div>
      ) : (
        <Card className="mb-5 bg-orange-50 ring-orange-200">
          <p className="font-extrabold text-stone-900">Contando: {placeName}</p>
          <p className="text-stone-600">Só o estoque deste local. O responsável fica no nome deste painel.</p>
        </Card>
      )}

      <div className="mb-4">
        <SearchField value={search} onChange={setSearch} placeholder="Procurar produto..." />
      </div>

      {rows.length === 0 ? (
        <Empty title="Nada para contar" hint="Cadastre produtos ou mande estoque para este local." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const counted = draft[row.key]?.counted ?? row.systemQty;
            const delta = counted - row.systemQty;
            const reason = draft[row.key]?.reason ?? "contagem";
            return (
              <Card key={row.key} className={delta !== 0 ? "ring-2 ring-orange-400" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold text-stone-900">{row.label}</p>
                    <p className="text-sm font-semibold text-stone-500">{row.hint}</p>
                    <p className="mt-1 font-bold text-stone-700">Sistema: {row.systemQty}</p>
                    {delta !== 0 ? (
                      <p className={delta < 0 ? "font-extrabold text-red-700" : "font-extrabold text-emerald-800"}>
                        Diferença: {delta > 0 ? `+${delta}` : delta}
                      </p>
                    ) : (
                      <p className="font-semibold text-stone-500">Bate com o sistema</p>
                    )}
                  </div>
                  <NumberStepper
                    value={counted}
                    max={99999}
                    onChange={(value) => setCounted(row.key, row.systemQty, value)}
                  />
                </div>
                {delta !== 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ADJUSTMENT_REASONS.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant={reason === item.id ? "secondary" : "ghost"}
                        className="min-h-11 text-sm"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            [row.key]: { counted, reason: item.id },
                          }))
                        }
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <Button className="w-full sm:w-auto" disabled={saving || diffs.length === 0} onClick={() => setConfirm(true)}>
          {diffs.length ? `Lançar ${diffs.length} ajuste${diffs.length === 1 ? "" : "s"}` : "Nenhuma diferença"}
        </Button>
      </div>

      <h2 className="mb-3 mt-10 text-2xl font-extrabold">Contagens deste local</h2>
      {!history?.length ? (
        <Empty title="Nenhum inventário lançado ainda" hint="A primeira contagem vira o histórico." />
      ) : (
        <div className="space-y-3">
          {historyPage.rows.map((row) => (
            <HistoryCard key={row.id} countId={row.id} />
          ))}
          <Pager
            page={historyPage.page}
            pages={historyPage.pages}
            total={historyPage.total}
            onPage={historyPage.setPage}
            word="contagens"
          />
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Lançar este inventário?"
        hint={`${placeName} · responsável ${panel?.name ?? ""}`}
        confirmLabel="Confirmar ajuste"
        confirmVariant="secondary"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {diffs.map((item) => (
            <li key={item.row.key} className="py-3">
              <p className="font-extrabold text-stone-900">{item.row.label}</p>
              <p className="text-sm font-semibold text-stone-600">
                Sistema {item.row.systemQty} → físico {item.counted} · {adjustmentReasonLabel(item.reason)}
              </p>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </AppShell>
  );
}

function HistoryCard({ countId }: { countId: string }) {
  const ready = useReady();
  const details = useLiveQuery(() => (ready ? inventoryCountDetails(countId) : null), [ready, countId]);
  if (!details) {
    return (
      <Card>
        <p className="font-bold text-stone-500">Carregando contagem...</p>
      </Card>
    );
  }

  const totalDiff = details.lines.reduce((sum, line) => sum + (line.countedQty - line.systemQty), 0);
  return (
    <Card>
      <p className="font-extrabold text-stone-900">
        {getLocation(details.count.locationId)?.name ?? details.count.locationId} · {details.count.countedBy}
      </p>
      <p className="text-stone-600">
        {formatDate(details.count.at.slice(0, 10))} · {formatTime(details.count.at)} · {details.lines.length} ajuste
        {details.lines.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-2 space-y-1 text-sm font-semibold text-stone-600">
        {details.lines.map((line) => (
          <li key={line.id}>
            Sistema {line.systemQty} → {line.countedQty} · {adjustmentReasonLabel(line.reason)}
          </li>
        ))}
      </ul>
      <p className={`mt-2 font-extrabold ${totalDiff < 0 ? "text-red-700" : "text-emerald-800"}`}>
        Saldo {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
      </p>
    </Card>
  );
}
