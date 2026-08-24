"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import { ReportPreview } from "@/components/ReportPreview";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getPanel } from "@/lib/locations";
import { reportRomaneio, type ReportTable } from "@/lib/reports";
import { cancelRequest, fulfillRequest, listRequests, requestWhen, RequestError } from "@/lib/requests";
import { getLocationId } from "@/lib/session";
import { StockError } from "@/lib/stock";
import { isOpenRequest } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function PedidosPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const requests = useLiveQuery(() => (ready ? listRequests() : []), [ready]);
  const canSend = panel?.type === "factory";
  const [qty, setQty] = useState<Record<string, Record<string, number>>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ReportTable | null>(null);
  const pending = (requests ?? []).filter((row) => isOpenRequest(row.status));
  const others = (requests ?? []).filter((row) => !isOpenRequest(row.status));
  const othersPage = usePager(others, 8);

  if (panel && panel.type === "store") {
    return (
      <AppShell>
        <Empty title="Os pedidos chegam aqui na fábrica e no admin" hint="Na loja, use Pedir para a fábrica." />
      </AppShell>
    );
  }

  function chosenQty(requestId: string, nicheId: string, fallback: number) {
    return qty[requestId]?.[nicheId] ?? fallback;
  }

  async function send(requestId: string) {
    setError("");
    setOk("");
    setBusy(requestId);
    try {
      const transferId = await fulfillRequest(requestId, qty[requestId], panel?.name ?? "Fábrica");
      setConfirmId(null);
      setOk("Saiu da fábrica. Imprima o romaneio para o motorista. A loja ainda confere.");
      if (transferId) setSheet(await reportRomaneio(transferId));
    } catch (err) {
      setError(err instanceof StockError || err instanceof RequestError ? err.message : "Não deu para mandar.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(requestId: string) {
    setError("");
    setOk("");
    setBusy(requestId);
    try {
      await cancelRequest(requestId);
      setOk("Pedido dispensado.");
    } catch (err) {
      setError(err instanceof RequestError ? err.message : "Não deu para dispensar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Pedidos das lojas"
        hint={
          canSend
            ? "A loja pediu na mão. O pedido mais antigo segura o saldo. Se outra loja já levou, isto aqui envelhece — não finge que 80 ainda vão sair."
            : "Aqui o admin vê o que as lojas pediram. Quem manda o estoque é a fábrica."
        }
      />
      <ErrorBox message={error} />
      <SuccessBox message={ok} />

      {pending.length === 0 ? (
        <Empty title="Nenhum pedido esperando" hint="Quando a loja pedir, aparece aqui e no sino de avisos." />
      ) : (
        <div className="space-y-4">
          {pending.map((request) => (
            <Card
              key={request.id}
              className={`space-y-4 ${request.status === "sem_saldo" ? "ring-1 ring-red-100" : ""}`}
            >
              <div>
                <p className="text-xl font-extrabold text-stone-900">
                  {request.storeName} · {request.statusLabel}
                </p>
                <p className="text-stone-500">{requestWhen(request.at)}</p>
                {request.note ? <p className="mt-2 font-semibold text-stone-700">Recado: {request.note}</p> : null}
                {request.status === "sem_saldo" ? (
                  <p className="mt-2 font-bold text-red-700">
                    A fábrica não tem saldo para este pedido agora. Produza ou o que tinha já foi para outro lugar.
                  </p>
                ) : request.status === "parcial" ? (
                  <p className="mt-2 font-bold text-orange-800">
                    Não tem tudo. Mande o que ainda cabe neste pedido — o resto continua aberto.
                  </p>
                ) : null}
              </div>
              {request.items.map((item) => {
                const fallback = Math.min(item.remaining, item.availableQty);
                return (
                  <div key={item.nicheId} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{item.label}</p>
                      <p className="text-sm text-stone-500">
                        Pediu {item.qty}
                        {item.sentQty > 0 ? ` · já mandou ${item.sentQty}` : ""}
                        {item.remaining > 0 ? ` · falta ${item.remaining}` : ""}
                      </p>
                      <p className="text-sm font-semibold text-stone-600">
                        Fábrica tem {item.factoryQty} válidas · para este pedido {item.availableQty}
                      </p>
                    </div>
                    {canSend ? (
                      <NumberStepper
                        value={chosenQty(request.id, item.nicheId, fallback)}
                        max={Math.max(item.availableQty, 0)}
                        onChange={(value) =>
                          setQty((current) => ({
                            ...current,
                            [request.id]: { ...current[request.id], [item.nicheId]: value },
                          }))
                        }
                      />
                    ) : (
                      <p className="text-xl font-extrabold">{item.remaining}</p>
                    )}
                  </div>
                );
              })}
              {canSend ? (
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={busy === request.id || request.items.every((item) => item.availableQty <= 0)}
                    onClick={() => {
                      setOk("");
                      setConfirmId(request.id);
                    }}
                  >
                    Revisar e mandar
                  </Button>
                  <Button variant="ghost" disabled={busy === request.id} onClick={() => dismiss(request.id)}>
                    Dispensar
                  </Button>
                </div>
              ) : (
                <p className="text-stone-600">Abra o painel da Fábrica para mandar este pedido.</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {others.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-2xl font-extrabold">Já resolvidos</h2>
          <div className="space-y-3">
            {othersPage.rows.map((request) => (
              <Card key={request.id}>
                <p className="font-extrabold">
                  {request.storeName} · {request.statusLabel}
                </p>
                <p className="text-stone-500">{requestWhen(request.at)}</p>
                <ul className="mt-1 text-stone-700">
                  {request.items.map((item) => (
                    <li key={item.nicheId}>
                      {item.label} · pediu {item.qty}
                      {item.sentQty > 0 ? ` · mandou ${item.sentQty}` : ""}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <Pager
              page={othersPage.page}
              pages={othersPage.pages}
              total={othersPage.total}
              onPage={othersPage.setPage}
              word="pedidos"
            />
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmId)}
        title={`Mandar para a ${pending.find((row) => row.id === confirmId)?.storeName ?? "loja"}?`}
        hint="Confira as quantidades. Sai da fábrica e fica em trânsito até a loja conferir."
        confirmLabel="Confirmar e mandar"
        busy={busy === confirmId}
        onConfirm={() => confirmId && send(confirmId)}
        onCancel={() => setConfirmId(null)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {(pending.find((row) => row.id === confirmId)?.items ?? []).map((item) => {
            const sendQty = chosenQty(
              confirmId ?? "",
              item.nicheId,
              Math.min(item.remaining, item.availableQty),
            );
            return (
              <li key={item.nicheId} className="flex justify-between gap-3 py-3">
                <span className="font-bold text-stone-800">{item.label}</span>
                <span className="font-extrabold">{sendQty} un.</span>
              </li>
            );
          })}
        </ul>
      </ConfirmDialog>
      {sheet ? <ReportPreview report={sheet} onClose={() => setSheet(null)} closeLabel="Voltar" /> : null}
    </AppShell>
  );
}
