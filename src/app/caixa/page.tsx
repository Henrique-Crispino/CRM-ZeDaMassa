"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "@/components/pick-flow";
import { SessionSalesList } from "@/components/SessionSalesList";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { CashMetric, OpenSessionCard, useCashWorkspace } from "@/components/caixa/workspace";
import { Button, Card, Empty, ErrorBox, Field, Input, SuccessBox } from "@/components/ui";
import {
  CASH_PERIODS,
  CASH_REOPEN_CODE,
  CashError,
  cashDay,
  cashDifferenceLabel,
  cashPeriodLabel,
  openCashSession,
  reopenCashSession,
  sessionLedger,
} from "@/lib/cash";
import { formatBRL, formatDate, formatTime, parseMoney, todayDate } from "@/lib/money";
import type { CashDestination, CashPeriod } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function CaixaTurnoPage() {
  const { isAdminPanel, locationId, employees, session, history, ledger, previous } = useCashWorkspace();
  const [period, setPeriod] = useState<CashPeriod>("manha");
  const [employeeId, setEmployeeId] = useState("");
  const [opening, setOpening] = useState("150,00");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [reopenId, setReopenId] = useState("");
  const [reopenPassword, setReopenPassword] = useState("");
  const [reopenNote, setReopenNote] = useState("");

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

  async function reopenSession() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await reopenCashSession({
        sessionId: reopenId,
        password: reopenPassword,
        note: reopenNote,
      });
      setReopenId("");
      setReopenPassword("");
      setReopenNote("");
      setOk("Caixa reaberto. Dá para estornar venda e lançar o apurado de novo.");
    } catch (err) {
      setError(err instanceof CashError ? err.message : "Não deu para reabrir o caixa.");
    } finally {
      setSaving(false);
    }
  }

  const reopenTarget = (history ?? []).find((row) => row.id === reopenId);
  const historyPage = usePager(history ?? [], 8, locationId ?? "");

  return (
    <>
      {session ? !ledger ? (
        <Card className="mb-6">
          <p className="text-lg font-bold text-stone-600">Carregando o movimento do caixa...</p>
        </Card>
      ) : (
        <>
          <OpenSessionCard />
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CashMetric label="Fundo de caixa" hint="Troco inicial" value={formatBRL(ledger.openingAmount)} />
            <CashMetric label="Vendas em espécie" hint="Dinheiro na gaveta" value={formatBRL(ledger.byPayment.dinheiro)} />
            <CashMetric label="Pix" hint="Não fica na gaveta" value={formatBRL(ledger.byPayment.pix)} />
            <CashMetric label="Cartão" hint="Não fica na gaveta" value={formatBRL(ledger.byPayment.cartao)} />
            <CashMetric label="Suprimentos" hint="Reforço de troco" value={formatBRL(ledger.supplyTotal)} />
            <CashMetric label="Sangrias" hint="Retirada com destino: cofre ou depósito" value={formatBRL(ledger.sangriaTotal)} />
            <CashMetric
              label="Saldo esperado em espécie"
              hint="Fundo + dinheiro + suprimento − sangria"
              value={formatBRL(ledger.expectedCash)}
              accent
            />
            <CashMetric label="Total do turno" hint="Dinheiro, Pix e cartão" value={formatBRL(ledger.salesTotal)} />
          </div>
          <div className="mb-6">
            <SessionSalesList sessionId={session.id} canVoid />
          </div>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
        </>
      ) : isAdminPanel ? (
        <Card className="mb-6 bg-orange-50 ring-orange-200">
          <p className="text-lg font-extrabold text-stone-900">Nenhum caixa aberto nesta loja</p>
          <p className="text-stone-600">
            A loja abre o turno. Se o apurado do dia saiu errado, reabra no histórico — não lance sangria falsa.
          </p>
        </Card>
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
        <div>
          <PageBoard ref={historyPage.listRef} size={historyPage.size} rowMin="7.25rem">
            {historyPage.rows.map((row) => (
              <HistoryCard
                key={row.id}
                sessionId={row.id}
                fallback={row}
                canReopen={
                  isAdminPanel &&
                  Boolean(row.closedAt) &&
                  !session &&
                  cashDay(row.openedAt) === todayDate()
                }
                onReopen={() => {
                  setReopenId(row.id);
                  setReopenPassword("");
                  setReopenNote("");
                  setError("");
                }}
              />
            ))}
          </PageBoard>
          <Pager
            page={historyPage.page}
            pages={historyPage.pages}
            total={historyPage.total}
            onPage={historyPage.setPage}
            word="caixas"
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(reopenId)}
        title="Reabrir este caixa?"
        hint={`Só o caixa do dia. No demo a senha é ${CASH_REOPEN_CODE}. Não é login de verdade.`}
        confirmLabel="Reabrir caixa"
        confirmVariant="secondary"
        confirmDisabled={reopenPassword.trim() === "" || reopenNote.trim().length < 3}
        busy={saving}
        onConfirm={reopenSession}
        onCancel={() => {
          setReopenId("");
          setReopenPassword("");
          setReopenNote("");
        }}
      >
        {reopenTarget ? (
          <ul className="mb-4 space-y-2 font-semibold text-stone-800">
            <li>
              {cashPeriodLabel(reopenTarget.period)} · {reopenTarget.employeeName}
            </li>
            <li>Apurado: {reopenTarget.closingAmount != null ? formatBRL(reopenTarget.closingAmount) : "—"}</li>
            <li>
              {reopenTarget.difference != null
                ? `${cashDifferenceLabel(reopenTarget.difference)}: ${formatBRL(reopenTarget.difference)}`
                : "Sem diferença"}
            </li>
          </ul>
        ) : null}
        <div className="space-y-4">
          <Field label="Senha da administração" hint="Código em settings. No demo não tem auth de verdade.">
            <Input
              type="password"
              value={reopenPassword}
              onChange={(event) => setReopenPassword(event.target.value)}
              placeholder="Senha"
            />
          </Field>
          <Field label="Por que reabre" hint="Fica no turno. Sem motivo não reabre.">
            <Input
              value={reopenNote}
              onChange={(event) => setReopenNote(event.target.value)}
              placeholder="Apurado digitado errado"
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

function sangriaHint(movements: { type: string; amount: number; destination?: CashDestination }[]) {
  const sangrias = movements.filter((item) => item.type === "sangria");
  if (sangrias.length === 0) return "";
  const cofre = sangrias.filter((item) => item.destination === "cofre").reduce((sum, item) => sum + item.amount, 0);
  const deposito = sangrias.filter((item) => item.destination === "deposito").reduce((sum, item) => sum + item.amount, 0);
  const parts = [
    cofre > 0 ? `cofre ${formatBRL(cofre)}` : "",
    deposito > 0 ? `depósito ${formatBRL(deposito)}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

function HistoryCard({
  sessionId,
  fallback,
  canReopen,
  onReopen,
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
    secondCount?: number;
    recountedBy?: string;
    reopenedAt?: string;
    reopenNote?: string;
    reopenCount?: number;
  };
  canReopen?: boolean;
  onReopen?: () => void;
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
          <p>
            Pix {formatBRL(ledger.byPayment.pix)} · Cartão {formatBRL(ledger.byPayment.cartao)}
          </p>
          <p>
            Sangria {formatBRL(ledger.sangriaTotal)}
            {sangriaHint(ledger.movements)}
            {" · "}
            Suprimento {formatBRL(ledger.supplyTotal)}
          </p>
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
      {(ledger?.session.recountedBy ?? fallback.recountedBy) ? (
        <p className="mt-1 text-sm font-semibold text-stone-600">
          2ª contagem {formatBRL(ledger?.session.secondCount ?? fallback.secondCount ?? 0)}
          {" · conferido por "}
          {ledger?.session.recountedBy ?? fallback.recountedBy}
        </p>
      ) : null}
      {fallback.note ? <p className="mt-1 text-sm text-stone-500">{fallback.note}</p> : null}
      {(ledger?.session.reopenedAt ?? fallback.reopenedAt) ? (
        <p className="mt-1 text-sm font-semibold text-orange-800">
          Reabriu
          {(ledger?.session.reopenCount ?? fallback.reopenCount) ? ` ${ledger?.session.reopenCount ?? fallback.reopenCount}×` : ""}
          {(ledger?.session.reopenNote ?? fallback.reopenNote)
            ? ` · ${ledger?.session.reopenNote ?? fallback.reopenNote}`
            : ""}
        </p>
      ) : null}
      {canReopen ? (
        <Button className="mt-3" variant="secondary" onClick={onReopen}>
          Reabrir o caixa do dia
        </Button>
      ) : null}
    </Card>
  );
}
