"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/pick-flow";
import { CashClosed, CashLoading, OpenSessionCard, useCashWorkspace } from "@/components/caixa/workspace";
import { Button, Card, ErrorBox, Field, Input, SuccessBox } from "@/components/ui";
import { CashError, registerCashMovement } from "@/lib/cash";
import { formatBRL, formatTime, parseMoney } from "@/lib/money";
import type { CashDestination, CashMovementKind } from "@/lib/types";
import { CASH_DESTINATIONS, cashDestinationLabel } from "@/lib/types";

export default function CaixaSangriaPage() {
  const { session, ledger } = useCashWorkspace();
  const [moveType, setMoveType] = useState<CashMovementKind>("sangria");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveDestination, setMoveDestination] = useState<CashDestination>("cofre");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (session === undefined) {
    return <CashLoading />;
  }

  if (session === null) {
    return (
      <CashClosed
        title="O caixa está fechado"
        hint="Abra o turno para tirar ou pôr dinheiro na gaveta."
      />
    );
  }

  const openSession = session;

  if (!ledger) {
    return (
      <Card>
        <p className="text-lg font-bold text-stone-600">Carregando o movimento do caixa...</p>
      </Card>
    );
  }

  const amount = parseMoney(moveAmount);
  const canReview = amount > 0 && moveReason.trim().length >= 2;

  async function saveMovement() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await registerCashMovement({
        sessionId: openSession.id,
        type: moveType,
        amount,
        reason: moveReason,
        destination: moveType === "sangria" ? moveDestination : undefined,
      });
      setMoveAmount("");
      setMoveReason("");
      setConfirm(false);
      setOk(
        moveType === "sangria"
          ? `Sangria lançada para o ${cashDestinationLabel(moveDestination).toLowerCase()}. Saiu da gaveta.`
          : "Suprimento lançado. O troco entrou na gaveta.",
      );
    } catch (err) {
      setConfirm(false);
      setError(err instanceof CashError ? err.message : "Não deu para lançar este movimento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <OpenSessionCard />
      <Card className="mb-6 space-y-4">
        <p className="text-lg font-extrabold">Sangria e troco</p>
        <p className="text-stone-600">
          Sangria tira o excesso da gaveta. Tem que dizer para onde foi: cofre da loja ou depósito. Suprimento põe troco na gaveta.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={moveType === "sangria" ? "secondary" : "ghost"}
            onClick={() => setMoveType("sangria")}
          >
            Sangria
          </Button>
          <Button
            type="button"
            variant={moveType === "suprimento" ? "primary" : "ghost"}
            onClick={() => setMoveType("suprimento")}
          >
            Suprimento
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={moveType === "sangria" ? "Valor da sangria" : "Valor do suprimento"}
            hint={moveType === "sangria" ? "Sai da gaveta." : "Entra na gaveta."}
          >
            <Input
              inputMode="decimal"
              value={moveAmount}
              onChange={(event) => setMoveAmount(event.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Motivo" hint="Ex.: excesso na gaveta, falta de troco, recolhimento.">
            <Input
              value={moveReason}
              onChange={(event) => setMoveReason(event.target.value)}
              placeholder={moveType === "sangria" ? "Excesso na gaveta" : "Reforço de troco"}
            />
          </Field>
        </div>
        {moveType === "sangria" ? (
          <div>
            <p className="mb-2 text-base font-bold text-stone-800">Para onde foi</p>
            <div className="grid grid-cols-2 gap-2">
              {CASH_DESTINATIONS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={moveDestination === item.id ? "secondary" : "ghost"}
                  onClick={() => setMoveDestination(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-stone-500">
              {CASH_DESTINATIONS.find((item) => item.id === moveDestination)?.hint}
            </p>
          </div>
        ) : null}
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <Button
          disabled={saving || !canReview}
          variant={moveType === "sangria" ? "secondary" : "primary"}
          onClick={() => setConfirm(true)}
        >
          {moveType === "sangria" ? "Conferir sangria" : "Conferir suprimento"}
        </Button>
        {ledger.movements.length > 0 ? (
          <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50">
            {ledger.movements.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-extrabold">{item.type === "sangria" ? "Sangria" : "Suprimento"}</span>
                  <span className="block text-sm font-semibold text-stone-500">
                    {formatTime(item.at)}
                    {item.type === "sangria" ? ` · ${cashDestinationLabel(item.destination)}` : ""}
                    {" · "}
                    {item.reason}
                  </span>
                </span>
                <span className="font-extrabold">{formatBRL(item.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirm}
        title={moveType === "sangria" ? "Lançar esta sangria?" : "Lançar este suprimento?"}
        hint={
          moveType === "sangria"
            ? "O valor sai da gaveta. Confira o destino antes de gravar."
            : "O valor entra na gaveta como troco."
        }
        confirmLabel={moveType === "sangria" ? "Lançar sangria" : "Lançar suprimento"}
        confirmVariant={moveType === "sangria" ? "secondary" : "primary"}
        busy={saving}
        onConfirm={saveMovement}
        onCancel={() => setConfirm(false)}
      >
        <ul className="space-y-2 font-semibold text-stone-800">
          <li>Valor: {formatBRL(amount)}</li>
          <li>Motivo: {moveReason.trim()}</li>
          {moveType === "sangria" ? <li>Para onde: {cashDestinationLabel(moveDestination)}</li> : null}
        </ul>
      </ConfirmDialog>
    </>
  );
}
