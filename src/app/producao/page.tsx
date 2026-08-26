"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Card, Empty, PageTitle } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getPanel } from "@/lib/locations";
import { formatDate, formatTime, todayDate } from "@/lib/money";
import { listProductionLogs } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function ProducaoPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const today = todayDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const logs = useLiveQuery(
    () => (ready ? listProductionLogs(from ? 400 : 80, from || undefined, to || undefined) : []),
    [ready, from, to],
  );
  const list = usePager(logs ?? [], 8, `${from}|${to}`);

  const summary = useMemo(() => {
    const rows = logs ?? [];
    return {
      batches: rows.length,
      units: rows.reduce((sum, log) => sum + log.totalQty, 0),
    };
  }, [logs]);

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="O registro de produção é da fábrica e da administração"
      hint="A loja não lança produção. Quem produz é a fábrica; o admin acompanha o histórico."
    >
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <PageTitle
            title="Registro de produção"
            hint="O recorte é o dia em que o lote foi feito, não o horário em que a Rita lançou."
          />
          {panel?.type === "factory" ? (
            <Link
              href="/produzir"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-orange-600 px-5 text-lg font-bold text-white"
            >
              Lançar produção
            </Link>
          ) : null}
        </div>

        <Card className="mb-6 space-y-3">
          <DateRangeFilter
            from={from}
            to={to}
            onChange={(nextFrom, nextTo) => {
              setFrom(nextFrom);
              setTo(nextTo);
            }}
            presets={["today", "yesterday", "week", "all"]}
            allowEmpty
            maxToday={false}
            fromHint="Dia em que foi frito."
            toHint="Inclui este dia."
          />
          {logs?.length ? (
            <p className="text-sm font-semibold text-stone-600">
              {summary.batches} {summary.batches === 1 ? "lançamento" : "lançamentos"} · {summary.units} un.
              {from && to
                ? from === to
                  ? ` · feito em ${formatDate(from)}`
                  : ` · feito de ${formatDate(from)} até ${formatDate(to)}`
                : ""}
            </p>
          ) : null}
        </Card>

        {!logs?.length ? (
          <Empty
            title={from ? "Nada produzido neste recorte" : "Ainda não tem produção registrada"}
            hint={
              from
                ? "Tente outras datas. O filtro olha o dia em que o lote foi feito."
                : "Quando a fábrica lançar o que foi feito, o registro aparece aqui."
            }
          />
        ) : (
          <div ref={list.listRef} className="scroll-mt-36 space-y-3">
            {list.rows.map((log) => (
              <Card key={log.refId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase text-orange-700">
                      Feito em {formatDate(log.madeAt)}
                    </p>
                    <p className="text-xl font-extrabold text-stone-900">{log.totalQty} unidades</p>
                    <p className="text-sm font-semibold text-stone-500">
                      Lançado {formatDate(log.at.slice(0, 10))} às {formatTime(log.at)}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-stone-700">
                  {log.items.map((item, index) => (
                    <li key={`${log.refId}-${item.label}-${index}`}>
                      <span className="font-bold">{item.qty}×</span> {item.label}
                      {item.expiresAt ? (
                        <span className="text-sm font-semibold text-stone-500">
                          {" "}
                          · vence {formatDate(item.expiresAt)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={list.setPage} word="lotes" />
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
