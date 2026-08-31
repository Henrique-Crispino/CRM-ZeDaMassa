"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { Card } from "@/components/ui";
import { listOpenParties, partyIsOverdue } from "@/lib/encomendas";
import { formatBRL, formatDate } from "@/lib/money";
import { useReady } from "@/lib/use-ready";

export function OpenParties({ storeId }: { storeId?: string }) {
  const ready = useReady();
  const forStore = Boolean(storeId);
  const parties = useLiveQuery(
    () => (ready ? listOpenParties(storeId) : []),
    [ready, storeId],
  );
  const rows = parties ?? [];
  const list = usePager(rows, 4, String(rows.length));
  const due = rows.reduce((sum, row) => sum + row.due, 0);

  if (forStore && rows.length === 0) return null;

  return (
    <Card className={forStore ? "mb-6" : "mb-6 mt-6"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900">Festas em aberto</h2>
          <p className="mt-1 text-stone-600">
            {rows.length > 0
              ? forStore
                ? `${rows.length} festa(s) · falta receber ${formatBRL(due)} nesta loja.`
                : `${rows.length} festa(s) · a receber ${formatBRL(due)} nas lojas. Não entra no Vendeu.`
              : "Nenhuma festa com sinal e resto em aberto agora."}
          </p>
          <p className="mt-1 text-sm font-semibold text-stone-500">
            {forStore
              ? "Receba o sinal em Pedir — aí a fábrica manda. O resto, no dia, com o caixa aberto."
              : "Sinal na loja, depois a fábrica manda. O resto se recebe na loja, em Pedir, no dia."}
          </p>
        </div>
        <Link
          href={forStore ? "/pedir" : "/pedidos"}
          className="inline-flex min-h-12 items-center rounded-2xl bg-orange-600 px-4 text-base font-bold text-white hover:bg-orange-700"
        >
          {forStore ? "Receber o resto" : "Ver pedidos"}
        </Link>
      </div>
      {rows.length > 0 ? (
        <>
          <PageBoard ref={list.listRef} size={list.size} rowMin="5.5rem" className="mt-4">
            {list.rows.map((party) => {
              const late = partyIsOverdue(party.neededBy);
              const title = [
                forStore ? null : party.storeName,
                party.guestName || (forStore ? "Encomenda" : null),
                party.neededBy ? formatDate(party.neededBy) : null,
                late ? "Atrasada" : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={party.id}
                  className={`rounded-2xl px-4 py-3 font-semibold text-stone-800 ${
                    late ? "bg-red-50" : "bg-orange-50"
                  }`}
                >
                  <p className="font-extrabold text-stone-900">{title}</p>
                  <p className={late ? "text-red-800" : "text-emerald-800"}>
                    Sinal {formatBRL(party.signalAmount)} · faltam {formatBRL(party.due)}
                  </p>
                  {party.priceDiffers && party.fifoTotal != null ? (
                    <p className="text-sm font-semibold text-orange-800">
                      Prateleira (FIFO) {formatBRL(party.fifoTotal)} · combinado {formatBRL(party.estimatedTotal)}
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-stone-500">
                    {party.stockLabel}
                    {party.itemsLabel ? ` · ${party.itemsLabel}` : ""}
                  </p>
                </div>
              );
            })}
          </PageBoard>
          <Pager
            page={list.page}
            pages={list.pages}
            total={list.total}
            onPage={list.setPage}
            word="festas"
          />
        </>
      ) : null}
    </Card>
  );
}
