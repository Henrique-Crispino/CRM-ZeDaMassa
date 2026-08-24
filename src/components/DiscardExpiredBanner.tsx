"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/pick-flow";
import { Button, Card, ErrorBox, SuccessBox } from "@/components/ui";
import { formatDate } from "@/lib/money";
import type { ExpiryAlert } from "@/lib/queries";
import { discardExpiredLots, StockError } from "@/lib/stock";

export function DiscardExpiredBanner({
  items,
  hint,
  place = "nesta loja",
}: {
  items: ExpiryAlert[];
  hint: string;
  place?: string;
}) {
  const expired = items.filter((item) => item.level === "expired");
  const units = expired.reduce((sum, item) => sum + item.qty, 0);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function discard() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await discardExpiredLots({
        items: expired.map((item) => ({
          locationId: item.locationId,
          nicheId: item.nicheId,
          lotId: item.lotId,
          qty: item.qty,
        })),
      });
      setConfirm(false);
      setOk(`${units} ${units === 1 ? "unidade vencida saiu" : "unidades vencidas saíram"} do estoque. Pode continuar.`);
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para descartar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (expired.length === 0) {
    return (
      <>
        <ErrorBox message={error} />
        {ok ? <div className="mb-4"><SuccessBox message={ok} /></div> : null}
      </>
    );
  }

  return (
    <>
      <Card className="mb-4 bg-red-50 ring-red-200">
        <p className="font-extrabold text-red-800">
          {units} un. vencidas {place}
        </p>
        <p className="mt-1 text-stone-700">{hint}</p>
        <Button className="mt-3" variant="danger" disabled={saving} onClick={() => { setError(""); setOk(""); setConfirm(true); }}>
          {saving ? "Descartando..." : "Descartar vencidos"}
        </Button>
      </Card>
      <ErrorBox message={error} />

      <ConfirmDialog
        open={confirm}
        title={expired.length === 1 ? "Descartar este lote vencido?" : "Descartar os vencidos?"}
        hint="Sai do estoque como perda por validade. Sobra do dia e venda não mudam."
        confirmLabel="Descartar e baixar estoque"
        confirmVariant="danger"
        busy={saving}
        onConfirm={discard}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {expired.map((item) => (
            <li key={`${item.locationId}-${item.lotId}`} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">
                {item.qty}× {item.label}
                <span className="block text-sm font-semibold text-stone-500">
                  Venceu {formatDate(item.expiresAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
