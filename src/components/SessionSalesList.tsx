"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "@/components/pick-flow";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { Button, Card, ErrorBox } from "@/components/ui";
import { listSessionTickets } from "@/lib/cash";
import { formatBRL, formatTime } from "@/lib/money";
import { StockError, voidSale } from "@/lib/stock";
import type { SaleVoidReason } from "@/lib/types";
import { SALE_VOID_REASONS, isLiveSale, paymentMethodLabel, salePayments, saleVoidReasonLabel } from "@/lib/types";

const CHANNEL_LABEL: Record<string, string> = {
  caixa: "No caixa",
  delivery: "Delivery",
  encomenda: "Encomenda",
};

export function SessionSalesList({
  sessionId,
  canVoid,
}: {
  sessionId: string;
  canVoid: boolean;
}) {
  const tickets = useLiveQuery(() => listSessionTickets(sessionId), [sessionId]);
  const pager = usePager(tickets ?? [], 8, sessionId);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [reason, setReason] = useState<SaleVoidReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const chosen = (tickets ?? []).find((ticket) => ticket.sale.id === saleId);

  async function confirm() {
    if (!saleId || !reason) return;
    setBusy(true);
    setError("");
    try {
      await voidSale({ saleId, reason });
      setOk("Venda estornada. O estoque voltou para o mesmo lote e o caixa já não conta este valor.");
      setSaleId(null);
      setReason("");
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para estornar esta venda.");
    } finally {
      setBusy(false);
    }
  }

  if (!tickets) {
    return (
      <Card>
        <p className="font-bold text-stone-500">Carregando as vendas deste turno...</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-lg font-extrabold">Vendas deste turno</p>
        <p className="text-stone-600">
          {canVoid
            ? "Digitou errado? Estorne com o caixa ainda aberto. A quantidade volta para o mesmo lote."
            : "O caixa deste turno já fechou. Estorno só no turno aberto. Reabertura do dia é com a administração."}
        </p>
      </div>
      {ok ? <p className="font-semibold text-emerald-800">{ok}</p> : null}
      <ErrorBox message={error} />
      {tickets.length === 0 ? (
        <p className="font-semibold text-stone-500">Nenhuma venda neste caixa ainda.</p>
      ) : (
        <>
          <PageBoard size={pager.size} rowMin="5.75rem">
            {pager.rows.map((ticket) => {
              const live = isLiveSale(ticket.sale);
              return (
                <div key={ticket.sale.id} className="space-y-2 rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={live ? "font-extrabold text-stone-900" : "font-extrabold text-stone-400 line-through"}>
                        {formatBRL(ticket.sale.total)}
                      </p>
                      <p className="text-sm font-semibold text-stone-500">
                        {formatTime(ticket.sale.at)} ·{" "}
                        {salePayments(ticket.sale)
                          .map((row) => `${paymentMethodLabel(row.method)} ${formatBRL(row.amount)}`)
                          .join(" + ")}{" "}
                        ·{" "}
                        {CHANNEL_LABEL[ticket.sale.channel]}
                      </p>
                      <p className="text-sm font-semibold text-stone-600">
                        {ticket.items
                          .map((item) => `${item.qty}× ${item.label}${item.promo ? " (promo)" : ""}`)
                          .join(" · ")}
                      </p>
                      {!live ? (
                        <p className="text-sm font-bold text-red-700">
                          Estornada · {saleVoidReasonLabel(ticket.sale.voidReason)}
                        </p>
                      ) : null}
                    </div>
                    {live && canVoid ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11 shrink-0 text-sm"
                        onClick={() => {
                          setError("");
                          setOk("");
                          setReason("");
                          setSaleId(ticket.sale.id);
                        }}
                      >
                        Estornar
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </PageBoard>
          <Pager
            page={pager.page}
            pages={pager.pages}
            total={pager.total}
            onPage={pager.setPage}
            word="vendas"
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(chosen)}
        title="Estornar esta venda?"
        hint="A quantidade volta para o mesmo lote. Some do faturamento. Se tinha dinheiro, some só essa parte do esperado em espécie."
        confirmLabel="Confirmar estorno"
        confirmVariant="danger"
        confirmDisabled={!reason}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => {
          if (busy) return;
          setSaleId(null);
          setReason("");
        }}
      >
        {chosen ? (
          <div className="space-y-4">
            <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
              {chosen.items.map((item) => (
                <li key={`${item.label}-${item.qty}-${item.unitPrice}`} className="flex justify-between gap-3 py-3">
                  <span className="font-bold text-stone-800">
                    {item.qty}× {item.label}
                    {item.promo ? " · promoção" : ""}
                  </span>
                  <span className="font-extrabold">{formatBRL(item.qty * item.unitPrice)}</span>
                </li>
              ))}
            </ul>
            <p className="text-2xl font-extrabold">{formatBRL(chosen.sale.total)}</p>
            <div>
              <p className="mb-2 font-bold">Por quê?</p>
              <div className="grid gap-2">
                {SALE_VOID_REASONS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={reason === item.id ? "secondary" : "ghost"}
                    onClick={() => setReason(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
