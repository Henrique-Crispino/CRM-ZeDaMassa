"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { cancelRequest, fulfillRequest, listRequests, requestWhen, RequestError } from "@/lib/requests";
import { getLocationId } from "@/lib/session";
import { StockError } from "@/lib/stock";
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

  if (panel && panel.type === "store") {
    return (
      <AppShell>
        <Empty title="Os pedidos chegam aqui na fábrica e no admin" hint="Na loja, use Pedir para a fábrica." />
      </AppShell>
    );
  }

  const pending = (requests ?? []).filter((row) => row.status === "pending");
  const others = (requests ?? []).filter((row) => row.status !== "pending");

  async function send(requestId: string) {
    setError("");
    setOk("");
    setBusy(requestId);
    try {
      await fulfillRequest(requestId, qty[requestId]);
      setConfirmId(null);
      setOk("Mandou para a loja. O estoque já foi atualizado.");
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
            ? "A loja pediu na mão. Confira a quantidade e mande, se fizer sentido."
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
            <Card key={request.id} className="space-y-4">
              <div>
                <p className="text-xl font-extrabold text-stone-900">{request.storeName} pediu</p>
                <p className="text-stone-500">{requestWhen(request.at)}</p>
                {request.note ? <p className="mt-2 font-semibold text-stone-700">Recado: {request.note}</p> : null}
              </div>
              {request.items.map((item) => (
                <div key={item.nicheId} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.label}</p>
                    <p className="text-sm text-stone-500">
                      Pediu {item.qty} · na fábrica tem {item.factoryQty}
                    </p>
                  </div>
                  {canSend ? (
                    <NumberStepper
                      value={qty[request.id]?.[item.nicheId] ?? Math.min(item.qty, Math.max(item.factoryQty, 0))}
                      max={Math.max(item.factoryQty, 0)}
                      onChange={(value) =>
                        setQty((current) => ({
                          ...current,
                          [request.id]: { ...current[request.id], [item.nicheId]: value },
                        }))
                      }
                    />
                  ) : (
                    <p className="text-xl font-extrabold">{item.qty}</p>
                  )}
                </div>
              ))}
              {canSend ? (
                <div className="flex flex-wrap gap-3">
                  <Button disabled={busy === request.id} onClick={() => { setOk(""); setConfirmId(request.id); }}>
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
            {others.slice(0, 10).map((request) => (
              <Card key={request.id}>
                <p className="font-extrabold">
                  {request.storeName} · {request.status === "sent" ? "enviado" : "dispensado"}
                </p>
                <p className="text-stone-500">{requestWhen(request.at)}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmId)}
        title={`Mandar para a ${pending.find((row) => row.id === confirmId)?.storeName ?? "loja"}?`}
        hint="Confira as quantidades. O estoque sai da fábrica e entra na loja."
        confirmLabel="Confirmar e mandar"
        busy={busy === confirmId}
        onConfirm={() => confirmId && send(confirmId)}
        onCancel={() => setConfirmId(null)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {(pending.find((row) => row.id === confirmId)?.items ?? []).map((item) => {
            const sendQty = qty[confirmId ?? ""]?.[item.nicheId] ?? Math.min(item.qty, Math.max(item.factoryQty, 0));
            return (
              <li key={item.nicheId} className="flex justify-between gap-3 py-3">
                <span className="font-bold text-stone-800">{item.label}</span>
                <span className="font-extrabold">{sendQty} un.</span>
              </li>
            );
          })}
        </ul>
      </ConfirmDialog>
    </AppShell>
  );
}
