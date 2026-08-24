"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageTitle,
  SuccessBox,
} from "@/components/ui";
import {
  CASH_PERIODS,
  CashError,
  cashDifferenceLabel,
  cashPeriodLabel,
  closeCashSession,
  currentCashSession,
  lastClosedSession,
  listCashSessions,
  listEmployees,
  openCashSession,
  registerCashMovement,
  sessionLedger,
} from "@/lib/cash";
import { getPanel } from "@/lib/locations";
import { formatBRL, formatDate, formatTime, parseMoney } from "@/lib/money";
import { getLocationId } from "@/lib/session";
import type { CashMovementKind, CashPeriod } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function CaixaPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const employees = useLiveQuery(
    () => (ready && locationId ? listEmployees(locationId) : []),
    [ready, locationId],
  );
  const session = useLiveQuery(
    () => (ready && locationId ? currentCashSession(locationId) : null),
    [ready, locationId],
  );
  const history = useLiveQuery(
    () => (ready && locationId ? listCashSessions(locationId) : []),
    [ready, locationId],
  );
  const ledger = useLiveQuery(
    () => (ready && session ? sessionLedger(session.id) : null),
    [ready, session?.id, session?.closedAt],
  );
  const previous = useLiveQuery(
    () => (ready && locationId && !session ? lastClosedSession(locationId) : null),
    [ready, locationId, session?.id],
  );

  const [period, setPeriod] = useState<CashPeriod>("manha");
  const [employeeId, setEmployeeId] = useState("");
  const [opening, setOpening] = useState("150,00");
  const [closing, setClosing] = useState("");
  const [note, setNote] = useState("");
  const [moveType, setMoveType] = useState<CashMovementKind>("sangria");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const chosenEmployee = useMemo(
    () => (employees ?? []).find((item) => item.id === employeeId) ?? employees?.[0],
    [employeeId, employees],
  );

  useEffect(() => {
    if (session) return;
    if (previous?.closingAmount != null) {
      setOpening(previous.closingAmount.toFixed(2).replace(".", ","));
    }
  }, [previous?.closingAmount, session]);

  const counted = parseMoney(closing);
  const previewDifference = ledger ? counted - ledger.expectedCash : 0;

  async function openSession() {
    if (!locationId || !chosenEmployee) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await openCashSession({
        locationId,
        period,
        employeeId: chosenEmployee.id,
        openingAmount: parseMoney(opening),
      });
      setOk("Caixa aberto. As vendas deste turno ficam neste movimento.");
    } catch (err) {
      setError(err instanceof CashError ? err.message : "Não deu para abrir o caixa.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement() {
    if (!session) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await registerCashMovement({
        sessionId: session.id,
        type: moveType,
        amount: parseMoney(moveAmount),
        reason: moveReason,
      });
      setMoveAmount("");
      setMoveReason("");
      setOk(moveType === "sangria" ? "Sangria lançada. O dinheiro saiu da gaveta." : "Suprimento lançado. O troco entrou na gaveta.");
    } catch (err) {
      setError(err instanceof CashError ? err.message : "Não deu para lançar este movimento.");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await closeCashSession({
        sessionId: session.id,
        closingAmount: parseMoney(closing),
        note,
      });
      setClosing("");
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
    <AccessGate
      allow={["store"]}
      title="O caixa é da loja"
      hint="Cada loja abre e fecha o próprio caixa por período, com o funcionário responsável."
    >
      <AppShell>
        <PageTitle
          title={`Caixa da ${panel?.name ?? "loja"}`}
          hint="Abertura com fundo de caixa. Durante o turno: sangria e suprimento. No encerramento: contagem e diferença."
        />

        {session ? !ledger ? (
          <Card className="mb-6">
            <p className="text-lg font-bold text-stone-600">Carregando o movimento do caixa...</p>
          </Card>
        ) : (
          <>
            <Card className="mb-6 space-y-2 bg-emerald-50 ring-emerald-200">
              <p className="text-sm font-bold uppercase text-emerald-800">Caixa aberto</p>
              <p className="text-2xl font-extrabold text-stone-900">
                {cashPeriodLabel(session.period)} · {session.employeeName}
              </p>
              <p className="text-stone-700">
                Aberto {formatTime(session.openedAt)} · {ledger.salesCount} cupons · faturamento{" "}
                {formatBRL(ledger.salesTotal)}
              </p>
            </Card>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Fundo de caixa" hint="Troco inicial" value={formatBRL(ledger.openingAmount)} />
              <Metric label="Vendas em espécie" hint="Dinheiro na gaveta" value={formatBRL(ledger.byPayment.dinheiro)} />
              <Metric label="Pix" hint="Não fica na gaveta" value={formatBRL(ledger.byPayment.pix)} />
              <Metric label="Cartão" hint="Não fica na gaveta" value={formatBRL(ledger.byPayment.cartao)} />
              <Metric label="Suprimentos" hint="Reforço de troco" value={formatBRL(ledger.supplyTotal)} />
              <Metric label="Sangrias" hint="Retirada para o cofre" value={formatBRL(ledger.sangriaTotal)} />
              <Metric
                label="Saldo esperado em espécie"
                hint="Fundo + dinheiro + suprimento − sangria"
                value={formatBRL(ledger.expectedCash)}
                accent
              />
              <Metric label="Faturamento do turno" hint="Todas as formas" value={formatBRL(ledger.salesTotal)} />
            </div>

            <Card className="mb-6 space-y-4">
              <p className="text-lg font-extrabold">Movimento de numerário</p>
              <p className="text-stone-600">
                Sangria tira o excesso da gaveta para o cofre. Suprimento põe troco do cofre na gaveta.
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
                <Field label="Motivo" hint="Ex.: excesso na gaveta, falta de troco, recolhimento ao cofre.">
                  <Input
                    value={moveReason}
                    onChange={(event) => setMoveReason(event.target.value)}
                    placeholder={moveType === "sangria" ? "Recolhimento ao cofre" : "Reforço de troco"}
                  />
                </Field>
              </div>
              <Button disabled={saving} variant={moveType === "sangria" ? "secondary" : "primary"} onClick={saveMovement}>
                {saving ? "Lançando..." : moveType === "sangria" ? "Lançar sangria" : "Lançar suprimento"}
              </Button>
              {ledger.movements.length > 0 ? (
                <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50">
                  {ledger.movements.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 px-4 py-3">
                      <span>
                        <span className="font-extrabold">{item.type === "sangria" ? "Sangria" : "Suprimento"}</span>
                        <span className="block text-sm font-semibold text-stone-500">
                          {formatTime(item.at)} · {item.reason}
                        </span>
                      </span>
                      <span className="font-extrabold">{formatBRL(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>

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
                <p
                  className={
                    Math.abs(previewDifference) < 0.005
                      ? "font-extrabold text-emerald-800"
                      : "font-extrabold text-red-700"
                  }
                >
                  {cashDifferenceLabel(previewDifference)}: {formatBRL(previewDifference)}
                </p>
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
              <Button disabled={saving || closing === ""} variant="secondary" onClick={() => setConfirmClose(true)}>
                Conferir e encerrar
              </Button>
            </Card>
          </>
        ) : (
          <Card className="mb-6 space-y-4">
            <p className="text-lg font-extrabold">Abertura do caixa</p>
            <div className="grid grid-cols-2 gap-2">
              {CASH_PERIODS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={period === item.id ? "primary" : "ghost"}
                  onClick={() => setPeriod(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-stone-500">{CASH_PERIODS.find((item) => item.id === period)?.hint}</p>
            {(employees ?? []).length === 0 ? (
              <Empty
                title="Cadastre a equipe desta loja"
                hint="A administração inclui os funcionários em Equipe. Sem isso, o caixa não abre."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(employees ?? []).map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={(chosenEmployee?.id ?? "") === item.id ? "secondary" : "ghost"}
                    onClick={() => setEmployeeId(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            )}
            <Field
              label="Fundo de caixa"
              hint={
                previous?.closingAmount != null
                  ? `Troco inicial da gaveta. O último encerramento ficou em ${formatBRL(previous.closingAmount)}.`
                  : "Troco inicial que entra na gaveta. Não é venda."
              }
            >
              <Input
                inputMode="decimal"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                placeholder="150,00"
              />
            </Field>
            <ErrorBox message={error} />
            <SuccessBox message={ok} />
            <Button disabled={saving || !(employees ?? []).length} onClick={openSession}>
              {saving ? "Abrindo..." : "Abrir caixa"}
            </Button>
          </Card>
        )}

        <h2 className="mb-3 text-2xl font-extrabold">Histórico desta loja</h2>
        {!history?.length ? (
          <Empty title="Nenhum caixa registrado ainda" />
        ) : (
          <div className="space-y-3">
            {history.slice(0, 16).map((row) => (
              <HistoryCard key={row.id} sessionId={row.id} fallback={row} />
            ))}
          </div>
        )}

        <ConfirmDialog
          open={confirmClose}
          title="Encerrar este caixa?"
          hint="A conferência compara o dinheiro apurado com o saldo esperado em espécie."
          confirmLabel="Encerrar caixa"
          busy={saving}
          onConfirm={closeSession}
          onCancel={() => setConfirmClose(false)}
        >
          {ledger ? (
            <ul className="space-y-2 font-semibold text-stone-800">
              <li>Fundo de caixa: {formatBRL(ledger.openingAmount)}</li>
              <li>Vendas em espécie: {formatBRL(ledger.byPayment.dinheiro)}</li>
              <li>Suprimentos: {formatBRL(ledger.supplyTotal)}</li>
              <li>Sangrias: {formatBRL(ledger.sangriaTotal)}</li>
              <li>Saldo esperado: {formatBRL(ledger.expectedCash)}</li>
              <li>Dinheiro apurado: {formatBRL(counted)}</li>
              <li className={Math.abs(previewDifference) < 0.005 ? "text-emerald-800" : "text-red-700"}>
                {cashDifferenceLabel(previewDifference)}: {formatBRL(previewDifference)}
              </li>
            </ul>
          ) : null}
        </ConfirmDialog>
      </AppShell>
    </AccessGate>
  );
}

function Metric({
  label,
  hint,
  value,
  accent,
}: {
  label: string;
  hint: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "bg-orange-50 ring-orange-200" : undefined}>
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-stone-900">{value}</p>
      <p className="text-sm font-semibold text-stone-500">{hint}</p>
    </Card>
  );
}

function HistoryCard({
  sessionId,
  fallback,
}: {
  sessionId: string;
  fallback: {
    period: CashPeriod;
    employeeName: string;
    openedAt: string;
    closedAt?: string;
    openingAmount: number;
    closingAmount?: number;
    difference?: number;
    note?: string;
  };
}) {
  const ready = useReady();
  const ledger = useLiveQuery(() => (ready ? sessionLedger(sessionId) : null), [ready, sessionId]);
  const difference = ledger?.difference ?? fallback.difference;
  const counted = ledger?.countedCash ?? fallback.closingAmount;

  return (
    <Card>
      <p className="font-extrabold text-stone-900">
        {cashPeriodLabel(fallback.period)} · {fallback.employeeName}
      </p>
      <p className="text-stone-600">
        {formatDate(fallback.openedAt.slice(0, 10))} · abriu {formatTime(fallback.openedAt)}
        {fallback.closedAt ? ` · encerrou ${formatTime(fallback.closedAt)}` : " · aberto"}
      </p>
      {ledger ? (
        <div className="mt-2 grid gap-1 text-sm font-semibold text-stone-600 sm:grid-cols-2">
          <p>Fundo {formatBRL(ledger.openingAmount)}</p>
          <p>Espécie {formatBRL(ledger.byPayment.dinheiro)}</p>
          <p>Pix {formatBRL(ledger.byPayment.pix)} · Cartão {formatBRL(ledger.byPayment.cartao)}</p>
          <p>Sangria {formatBRL(ledger.sangriaTotal)} · Suprimento {formatBRL(ledger.supplyTotal)}</p>
          <p>Esperado {formatBRL(ledger.expectedCash)}</p>
          <p>{counted != null ? `Apurado ${formatBRL(counted)}` : "Sem contagem"}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-stone-500">
          Fundo {formatBRL(fallback.openingAmount)}
          {counted != null ? ` · apurado ${formatBRL(counted)}` : ""}
        </p>
      )}
      {fallback.closedAt && difference != null ? (
        <p className={`mt-2 font-extrabold ${Math.abs(difference) < 0.005 ? "text-emerald-800" : "text-red-700"}`}>
          {cashDifferenceLabel(difference)}: {formatBRL(difference)}
        </p>
      ) : null}
      {fallback.note ? <p className="mt-1 text-sm text-stone-500">{fallback.note}</p> : null}
    </Card>
  );
}
