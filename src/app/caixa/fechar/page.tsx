"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/pick-flow";
import { CashClosed, CashLoading, OpenSessionCard, useCashWorkspace } from "@/components/caixa/workspace";
import { Button, Card, ErrorBox, Field, Input, SuccessBox } from "@/components/ui";
import { CashError, cashDifferenceLabel, closeCashSession, needsCashRecount } from "@/lib/cash";
import { formatBRL, parseMoney } from "@/lib/money";

export default function CaixaFecharPage() {
  const { session, ledger } = useCashWorkspace();
  const [closing, setClosing] = useState("");
  const [secondCount, setSecondCount] = useState("");
  const [recountedBy, setRecountedBy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (session === undefined) {
    return <CashLoading />;
  }

  if (session === null) {
    return (
      <CashClosed
        title="O caixa está fechado"
        hint="Não tem o que encerrar. Abra o turno se for o começo do dia."
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

  const counted = parseMoney(closing);
  const previewDifference = counted - ledger.expectedCash;
  const mustRecount = Boolean(closing) && needsCashRecount(previewDifference);
  const recountReady =
    !mustRecount ||
    (secondCount !== "" && Math.abs(parseMoney(secondCount) - counted) < 0.005 && recountedBy.trim().length >= 2);

  async function closeSession() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await closeCashSession({
        sessionId: openSession.id,
        closingAmount: parseMoney(closing),
        secondCount: mustRecount ? parseMoney(secondCount) : undefined,
        recountedBy: mustRecount ? recountedBy : undefined,
        note,
      });
      setClosing("");
      setSecondCount("");
      setRecountedBy("");
      setNote("");
      setConfirmClose(false);
      setOk("Caixa encerrado. O próximo turno já pode abrir o período dele.");
    } catch (err) {
      setConfirmClose(false);
      setError(err instanceof CashError ? err.message : "Não deu para fechar o caixa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <OpenSessionCard />
      <Card className="mb-6 space-y-4">
        <p className="text-lg font-extrabold">Encerramento do caixa</p>
        <p className="text-stone-600">
          Conte o dinheiro que está na gaveta agora. Pix e cartão não entram nesta contagem.
        </p>
        <Field
          label="Dinheiro apurado"
          hint={`Saldo esperado em espécie: ${formatBRL(ledger.expectedCash)}`}
        >
          <Input
            inputMode="decimal"
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            placeholder="0,00"
          />
        </Field>
        {closing ? (
          <p className={mustRecount ? "font-extrabold text-red-700" : "font-extrabold text-emerald-800"}>
            {cashDifferenceLabel(previewDifference)}: {formatBRL(previewDifference)}
          </p>
        ) : null}
        {mustRecount ? (
          <>
            <Card className="bg-orange-50 ring-orange-200">
              <p className="font-extrabold text-stone-900">Conte de novo</p>
              <p className="text-stone-600">
                Quebra ou sobra não fecha com um número só. Segunda contagem e o nome de quem conferiu.
              </p>
            </Card>
            <Field
              label="Segunda contagem"
              hint="Tem que bater com o apurado. Se achou outro valor, corrija o apurado e conte outra vez."
            >
              <Input
                inputMode="decimal"
                value={secondCount}
                onChange={(event) => setSecondCount(event.target.value)}
                placeholder={closing}
              />
            </Field>
            <Field label="Conferido por" hint="Nome de quem fez a segunda contagem. No demo, digitar basta.">
              <Input
                value={recountedBy}
                onChange={(event) => setRecountedBy(event.target.value)}
                placeholder="Nome de quem conferiu"
              />
            </Field>
          </>
        ) : null}
        <Field label="Ocorrência (opcional)" hint="Use se houver quebra, sobra ou qualquer observação do turno.">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Quebra, sobra, troca de turno..."
          />
        </Field>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <Button
          disabled={saving || closing === "" || !recountReady}
          variant="secondary"
          onClick={() => setConfirmClose(true)}
        >
          Conferir e encerrar
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmClose}
        title="Encerrar este caixa?"
        hint={
          mustRecount
            ? "Duas contagens e um nome. Sem isso a quebra ou sobra não fecha."
            : "A conferência compara o dinheiro apurado com o saldo esperado em espécie."
        }
        confirmLabel="Encerrar caixa"
        busy={saving}
        onConfirm={closeSession}
        onCancel={() => setConfirmClose(false)}
      >
        <ul className="space-y-2 font-semibold text-stone-800">
          <li>Fundo de caixa: {formatBRL(ledger.openingAmount)}</li>
          <li>Vendas em espécie: {formatBRL(ledger.byPayment.dinheiro)}</li>
          <li>Suprimentos: {formatBRL(ledger.supplyTotal)}</li>
          <li>Sangrias: {formatBRL(ledger.sangriaTotal)}</li>
          <li>Saldo esperado: {formatBRL(ledger.expectedCash)}</li>
          <li>Dinheiro apurado: {formatBRL(counted)}</li>
          {mustRecount ? (
            <>
              <li>Segunda contagem: {formatBRL(parseMoney(secondCount))}</li>
              <li>Conferido por: {recountedBy.trim()}</li>
            </>
          ) : null}
          <li className={mustRecount ? "text-red-700" : "text-emerald-800"}>
            {cashDifferenceLabel(previewDifference)}: {formatBRL(previewDifference)}
          </li>
        </ul>
      </ConfirmDialog>
    </>
  );
}
