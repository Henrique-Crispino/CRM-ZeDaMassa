"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getPanel } from "@/lib/locations";
import { formatDate, formatTime } from "@/lib/money";
import { listTransfers, type TransferView } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { receiveTransfer, StockError } from "@/lib/stock";
import { useReady } from "@/lib/use-ready";

export default function ReceberPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const storeLocked = panel?.type === "store";
  const scope = storeLocked ? panelId ?? undefined : undefined;
  const transfers = useLiveQuery(
    () => (ready ? listTransfers({ toLocationId: scope, kind: "envio" }) : []),
    [ready, scope],
  );

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
  const selected = pending.find((row) => row.id === picked);

  const review = useMemo(() => {
    if (!selected) return [];
    return selected.items.map((item) => {
      const arrived = draft[item.id] ?? item.qty;
      return { item, arrived, delta: arrived - item.qty };
    });
  }, [selected, draft]);
  const hasGap = review.some((row) => row.delta !== 0);

  async function save() {
    if (!selected || !panel) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      await receiveTransfer({
        transferId: selected.id,
        receivedBy: panel.name,
        items: review.map((row) => ({ id: row.item.id, receivedQty: row.arrived })),
      });
      setConfirm(false);
      setPicked("");
      setOk(
        hasGap
          ? `Conferido com divergência. Entrou o que chegou — o que faltou ou veio a mais ficou visível neste envio.`
          : `Conferido. ${selected.sentQty} un. entraram no estoque da ${selected.storeName}.`,
      );
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para conferir este envio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Receber envio"
        hint="O que saiu da fábrica ainda não é estoque da loja. Conte o que chegou. Faltou ou veio a mais vira divergência, não sumiço."
      />

      {storeLocked ? (
        <Card className="mb-5 bg-orange-50 ring-orange-200">
          <p className="font-extrabold text-stone-900">Só os envios desta loja</p>
          <p className="text-stone-600">Quem confere fica no nome deste painel: {panel?.name}.</p>
        </Card>
      ) : (
        <Card className="mb-5 bg-orange-50 ring-orange-200">
          <p className="font-extrabold text-stone-900">Todos os envios em trânsito</p>
          <p className="text-stone-600">Fábrica e admin veem o caminho. A loja é quem deveria conferir no dia a dia.</p>
        </Card>
      )}

      <ErrorBox message={error} />
      <SuccessBox message={ok} />

      {pending.length === 0 && !selected ? (
        <Empty
          title="Nada em trânsito"
          hint="Quando a fábrica mandar, o envio aparece aqui. Enquanto não conferir, a loja não vende isso."
        />
      ) : null}

      {pending.length > 0 && !selected ? (
        <ul className="mb-8 space-y-3">
          {pending.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold text-stone-900">{row.storeName}</p>
                    <p className="font-semibold text-stone-600">
                      {formatDate(row.at)} · {formatTime(row.at)} · {row.sentQty} un. a caminho
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
                      setDraft(Object.fromEntries(row.items.map((item) => [item.id, item.qty])));
                      setOk("");
                      setError("");
                    }}
                  >
                    Conferir
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="mb-8">
          <Card className="mb-4">
            <p className="text-xl font-extrabold text-stone-900">{selected.storeName}</p>
            <p className="font-semibold text-stone-600">
              Saiu {formatDate(selected.at)} às {formatTime(selected.at)} · {selected.sentQty} un. no romaneio
            </p>
          </Card>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="soft"
              onClick={() => setDraft(Object.fromEntries(selected.items.map((item) => [item.id, item.qty])))}
            >
              Chegou tudo
            </Button>
            <Button variant="ghost" onClick={() => setPicked("")}>
              Voltar à lista
            </Button>
          </div>

          <div className="space-y-3">
            {selected.items.map((item) => {
              const arrived = draft[item.id] ?? item.qty;
              const delta = arrived - item.qty;
              return (
                <Card key={item.id} className={delta !== 0 ? "ring-1 ring-red-100" : undefined}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-stone-900">{item.label}</p>
                      <p className="text-sm font-semibold text-stone-500">{item.lotHint}</p>
                      <p className="font-semibold text-stone-600">No envio: {item.qty} un.</p>
                      {delta < 0 ? (
                        <p className="font-bold text-red-700">Faltaram {Math.abs(delta)}</p>
                      ) : delta > 0 ? (
                        <p className="font-bold text-orange-800">Vieram {delta} a mais</p>
                      ) : (
                        <p className="font-semibold text-emerald-800">Bateu com o envio</p>
                      )}
                    </div>
                    <NumberStepper
                      value={arrived}
                      onChange={(value) => setDraft((current) => ({ ...current, [item.id]: value }))}
                    />
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="mt-4">
            <Button onClick={() => { setError(""); setConfirm(true); }}>
              {hasGap ? "Confirmar com divergência" : "Confirmar: chegou tudo"}
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section>
          <h2 className="mb-3 text-2xl font-extrabold text-stone-900">Já conferidos</h2>
          <ul className="space-y-3">
            {historyPage.rows.map((row) => (
              <li key={row.id}>
                <HistoryCard row={row} />
              </li>
            ))}
          </ul>
          <Pager
            page={historyPage.page}
            pages={historyPage.pages}
            total={historyPage.total}
            onPage={historyPage.setPage}
            word="envios"
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title={hasGap ? "Conferir com divergência?" : `Entrar ${selected?.sentQty ?? 0} un. no estoque?`}
        hint={
          hasGap
            ? "O que chegou entra na loja. O que faltou ou veio a mais fica marcado neste envio — não some."
            : "Aí sim vira estoque vendável desta loja."
        }
        confirmLabel="Confirmar recebimento"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {review.map((row) => (
            <li key={row.item.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">{row.item.label}</span>
              <span className="font-extrabold">
                {row.arrived} un.
                {row.delta !== 0 ? ` · envio ${row.item.qty}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </AppShell>
  );
}

function HistoryCard({ row }: { row: TransferView }) {
  return (
    <Card className={row.status === "divergente" ? "ring-1 ring-red-100" : undefined}>
      <p className="text-lg font-extrabold text-stone-900">
        {row.storeName} · {row.statusLabel}
      </p>
      <p className="font-semibold text-stone-600">
        Saiu {formatDate(row.at)} · conferido {row.receivedAt ? `${formatDate(row.receivedAt)} às ${formatTime(row.receivedAt)}` : "—"}
      </p>
      <p className="font-semibold text-stone-600">
        Mandou {row.sentQty} · chegou {row.arrivedQty}
        {row.receivedBy ? ` · ${row.receivedBy}` : ""}
      </p>
      {row.status === "divergente" ? (
        <ul className="mt-2 space-y-1">
          {row.items
            .filter((item) => (item.receivedQty ?? item.qty) !== item.qty)
            .map((item) => (
              <li key={item.id} className="font-bold text-red-700">
                {item.label}: envio {item.qty} · chegou {item.receivedQty ?? 0}
              </li>
            ))}
        </ul>
      ) : null}
    </Card>
  );
}
