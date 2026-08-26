"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import { ReportPreview } from "@/components/ReportPreview";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { cancelFactoryOrder, deliverFactoryOrder, FactoryOrderError, listFactoryOrders, quoteFactoryOrder } from "@/lib/factory-orders";
import { partyMoneyPhrase } from "@/lib/encomendas";
import { getPanel } from "@/lib/locations";
import { reportRomaneio, type ReportTable } from "@/lib/reports";
import { cancelRequest, fulfillRequest, listRequests, requestWhen, RequestError, type RequestItemView } from "@/lib/requests";
import { formatBRL, formatDate } from "@/lib/money";
import { getLocationId } from "@/lib/session";
import { StockError } from "@/lib/stock";
import {
  isOpenRequest,
  PAYMENT_METHODS,
  paymentMethodLabel,
  storeRequestKind,
  storeRequestKindLabel,
  type PaymentMethod,
  type RequestStatus,
} from "@/lib/types";
import { useReady } from "@/lib/use-ready";

type QueueRow = {
  id: string;
  source: "store" | "customer";
  name: string;
  status: RequestStatus;
  statusLabel: string;
  at: string;
  note: string;
  neededBy?: string;
  guestName?: string;
  kindLabel?: string;
  estimatedTotal?: number;
  signalAmount?: number;
  deliveredAt?: string;
  items: RequestItemView[];
};

function storePartyMoney(row: QueueRow) {
  return row.source === "store" ? partyMoneyPhrase(row) : "";
}

export default function PedidosPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const requests = useLiveQuery(() => (ready ? listRequests() : []), [ready]);
  const orders = useLiveQuery(() => (ready ? listFactoryOrders() : []), [ready]);
  const canSend = panel?.type === "factory";
  const [qty, setQty] = useState<Record<string, Record<string, number>>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("pix");
  const [sheet, setSheet] = useState<ReportTable | null>(null);

  const queue = useMemo<QueueRow[]>(() => {
    const stores = (requests ?? []).map((row) => ({
      id: row.id,
      source: "store" as const,
      name: row.storeName,
      status: row.status,
      statusLabel: row.statusLabel,
      at: row.at,
      note: row.note,
      neededBy: row.neededBy,
      guestName: row.guestName,
      kindLabel: storeRequestKindLabel(storeRequestKind(row)),
      estimatedTotal: row.estimatedTotal,
      signalAmount: row.signalAmount,
      deliveredAt: row.deliveredAt,
      items: row.items,
    }));
    const customers = (orders ?? []).map((row) => ({
      id: row.id,
      source: "customer" as const,
      name: row.customerName,
      status: row.status,
      statusLabel: row.statusLabel,
      at: row.at,
      note: row.note,
      items: row.items,
    }));
    return [...stores, ...customers].sort((a, b) => b.at.localeCompare(a.at));
  }, [orders, requests]);

  const pending = queue.filter((row) => isOpenRequest(row.status));
  const others = queue.filter((row) => !isOpenRequest(row.status));
  const othersPage = usePager(others, 8);
  const pendingPage = usePager(pending, 4);
  const confirmRow = pending.find((row) => row.id === confirmId);
  const quote = useLiveQuery(
    () =>
      ready && confirmId && confirmRow?.source === "customer"
        ? quoteFactoryOrder(confirmId, qty[confirmId])
        : undefined,
    [ready, confirmId, confirmRow?.source, qty],
  );

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

  async function deliver(orderId: string) {
    setError("");
    setOk("");
    setBusy(orderId);
    try {
      const result = await deliverFactoryOrder(orderId, qty[orderId], { method: payMethod });
      setConfirmId(null);
      const paid = `${formatBRL(result.amount)} no ${paymentMethodLabel(result.method)}`;
      setOk(
        result.leftover
          ? `Saiu o que cabia. Recebeu ${paid}. O que faltou continua no pedido.`
          : `Saiu da câmara. Recebeu ${paid} na fábrica. A loja não ganhou estoque.`,
      );
    } catch (err) {
      setError(err instanceof FactoryOrderError ? err.message : "Não deu para separar.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(row: QueueRow) {
    setError("");
    setOk("");
    setBusy(row.id);
    try {
      if (row.source === "customer") await cancelFactoryOrder(row.id);
      else await cancelRequest(row.id);
      setOk("Pedido dispensado.");
    } catch (err) {
      setError(
        err instanceof RequestError || err instanceof FactoryOrderError ? err.message : "Não deu para dispensar.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Pedidos"
        hint={
          canSend
            ? "Loja e cliente de volume na mesma fila. O mais antigo segura o saldo. Encomenda da loja traz o dia da festa. Cliente levou sai da câmara e paga na fábrica — não vai para a loja e não mistura no caixa da loja."
            : "Aqui o admin vê o que as lojas e os clientes pediram. Quem manda o estoque da loja e quem separa na câmara é a fábrica."
        }
      />
      <ErrorBox message={error} />
      <SuccessBox message={ok} />

      {pending.length === 0 ? (
        <Empty title="Nenhum pedido esperando" hint="Quando a loja ou o cliente pedir, aparece aqui e no sino de avisos." />
      ) : (
        <div>
          <PageBoard ref={pendingPage.listRef} size={pendingPage.size} rowMin="16rem">
            {pendingPage.rows.map((request) => (
              <Card
                key={`${request.source}-${request.id}`}
                className={`space-y-4 ${request.status === "sem_saldo" ? "ring-1 ring-red-100" : ""}`}
              >
                <div>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-orange-800">
                    {request.source === "customer" ? "Cliente · câmara" : request.kindLabel ?? "Loja"}
                  </p>
                  <p className="text-xl font-extrabold text-stone-900">
                    {request.name} · {request.statusLabel}
                  </p>
                  <p className="text-stone-500">{requestWhen(request.at)}</p>
                  {request.neededBy ? (
                    <p className="mt-1 font-extrabold text-orange-900">Para {formatDate(request.neededBy)}</p>
                  ) : null}
                  {request.guestName ? <p className="mt-1 font-semibold text-stone-700">{request.guestName}</p> : null}
                  {storePartyMoney(request) ? (
                    <p className="mt-1 font-semibold text-emerald-800">{storePartyMoney(request)}</p>
                  ) : null}
                  {request.note ? <p className="mt-2 font-semibold text-stone-700">Recado: {request.note}</p> : null}
                  {request.status === "sem_saldo" ? (
                    <p className="mt-2 font-bold text-red-700">
                      {request.source === "customer"
                        ? "A câmara não tem saldo para este pedido agora. Produza ou o que tinha já foi para outro lugar."
                        : "A fábrica não tem saldo para este pedido agora. Produza ou o que tinha já foi para outro lugar."}
                    </p>
                  ) : request.status === "parcial" ? (
                    <p className="mt-2 font-bold text-orange-800">
                      Não tem tudo. O mais antigo da fila ficou com o que cabia — o resto continua aberto.
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
                          Câmara tem {item.factoryQty} válidas · para este pedido {item.availableQty}
                          {request.source === "customer" && item.storeWaitingQty > 0
                            ? ` · loja já espera ${item.storeWaitingQty}`
                            : ""}
                        </p>
                      </div>
                      {canSend && (request.source === "store" || request.source === "customer") ? (
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
                        <p className="text-xl font-extrabold">{item.availableQty}</p>
                      )}
                    </div>
                  );
                })}
                {canSend ? (
                  <div className="flex flex-wrap gap-3">
                    {request.source === "store" ? (
                      <Button
                        disabled={busy === request.id || request.items.every((item) => item.availableQty <= 0)}
                        onClick={() => {
                          setOk("");
                          setConfirmId(request.id);
                        }}
                      >
                        Revisar e mandar
                      </Button>
                    ) : (
                      <Button
                        disabled={busy === request.id || request.items.every((item) => item.availableQty <= 0)}
                        onClick={() => {
                          setOk("");
                          setConfirmId(request.id);
                        }}
                      >
                        Cliente levou
                      </Button>
                    )}
                    <Button variant="ghost" disabled={busy === request.id} onClick={() => dismiss(request)}>
                      Dispensar
                    </Button>
                  </div>
                ) : (
                  <p className="text-stone-600">Abra o painel da Fábrica para tratar este pedido.</p>
                )}
              </Card>
            ))}
          </PageBoard>
          <Pager
            page={pendingPage.page}
            pages={pendingPage.pages}
            total={pendingPage.total}
            onPage={pendingPage.setPage}
            word="pedidos"
          />
        </div>
      )}

      {others.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-2xl font-extrabold">Já resolvidos</h2>
          <PageBoard ref={othersPage.listRef} size={othersPage.size} rowMin="7.5rem">
            {othersPage.rows.map((request) => (
              <Card key={`${request.source}-${request.id}`}>
                <p className="font-extrabold">
                  {request.source === "customer" ? "Cliente · " : request.kindLabel ? `${request.kindLabel} · ` : ""}
                  {request.name} · {request.statusLabel}
                  {request.neededBy ? ` · ${formatDate(request.neededBy)}` : ""}
                </p>
                {request.guestName ? <p className="text-stone-600">{request.guestName}</p> : null}
                {storePartyMoney(request) ? (
                  <p className="font-semibold text-emerald-800">{storePartyMoney(request)}</p>
                ) : null}
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
          </PageBoard>
          <Pager
            page={othersPage.page}
            pages={othersPage.pages}
            total={othersPage.total}
            onPage={othersPage.setPage}
            word="pedidos"
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmId && confirmRow)}
        title={
          confirmRow?.source === "customer"
            ? `${confirmRow.name} levou?`
            : `Mandar para a ${confirmRow?.name ?? "loja"}?`
        }
        hint={
          confirmRow?.source === "customer"
            ? "Confira as quantidades e como pagou. Sai da câmara agora. Não vai para a loja. O dinheiro fica na fábrica."
            : confirmRow?.neededBy
              ? `Para ${formatDate(confirmRow.neededBy)}. Sai da fábrica e fica em trânsito até a loja conferir.`
              : "Confira as quantidades. Sai da fábrica e fica em trânsito até a loja conferir."
        }
        confirmLabel={confirmRow?.source === "customer" ? "Confirmar: cliente levou" : "Confirmar e mandar"}
        busy={busy === confirmId}
        confirmDisabled={
          confirmRow?.source === "customer" && (!quote || quote.qty <= 0)
        }
        onConfirm={() => {
          if (!confirmId || !confirmRow) return;
          if (confirmRow.source === "customer") deliver(confirmId);
          else send(confirmId);
        }}
        onCancel={() => setConfirmId(null)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {(confirmRow?.items ?? []).map((item) => {
            const sendQty = chosenQty(
              confirmId ?? "",
              item.nicheId,
              Math.min(item.remaining, item.availableQty),
            );
            const line = quote?.lines.find((row) => row.nicheId === item.nicheId);
            return (
              <li key={item.nicheId} className="py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-stone-800">{item.label}</span>
                  <span className="font-extrabold">
                    {sendQty} un.
                    {confirmRow?.source === "customer" && line ? ` · ${formatBRL(line.revenue)}` : ""}
                  </span>
                </div>
                {confirmRow?.source === "customer" ? (
                  <p className="mt-1 text-sm font-semibold text-stone-600">
                    Câmara {item.factoryQty} · pedido {item.remaining} · livres {item.availableQty}
                    {item.storeWaitingQty > 0 ? ` · loja já espera ${item.storeWaitingQty}` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {confirmRow?.source === "customer" ? (
          <div className="mt-4 space-y-3">
            <p className="text-xl font-extrabold text-stone-900">
              {quote ? `Recebe ${formatBRL(quote.revenue)} na fábrica` : "Contando o total..."}
            </p>
            <p className="font-bold text-stone-700">Como pagou</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={payMethod === item.id ? "secondary" : "ghost"}
                  className="min-h-12 px-2 text-sm"
                  onClick={() => setPayMethod(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <p className="text-sm font-semibold text-stone-600">
              Pagou na fábrica. A loja não vê este dinheiro.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
      {sheet ? <ReportPreview report={sheet} onClose={() => setSheet(null)} closeLabel="Voltar" /> : null}
    </AppShell>
  );
}
