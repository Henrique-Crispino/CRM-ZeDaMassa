"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { Card } from "@/components/ui";
import { listRequests, requestWhen } from "@/lib/requests";
import { useReady } from "@/lib/use-ready";

export function PendingRequests({ canSend }: { canSend: boolean }) {
  const ready = useReady();
  const pending = useLiveQuery(
    () => (ready ? listRequests("open") : []),
    [ready],
  );

  const rows = pending ?? [];
  const list = usePager(rows, 4, String(rows.length));

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900">Pedidos feitos na mão</h2>
          <p className="mt-1 text-stone-600">
            {rows.length > 0
              ? `${rows.length} loja(s) pediram produto agora.`
              : "Nenhuma loja pediu manualmente neste momento."}
          </p>
        </div>
        <Link
          href="/pedidos"
          className="inline-flex min-h-12 items-center rounded-2xl bg-orange-600 px-4 text-base font-bold text-white hover:bg-orange-700"
        >
          {canSend ? "Atender pedidos" : "Ver pedidos"}
        </Link>
      </div>
      {rows.length > 0 ? (
        <>
          <PageBoard ref={list.listRef} size={list.size} rowMin="4.5rem" className="mt-4">
            {list.rows.map((request) => (
              <div key={request.id} className="rounded-2xl bg-orange-50 px-4 py-3 font-semibold text-stone-800">
                {request.storeName} · {request.statusLabel} ·{" "}
                {request.items.map((item) => `${item.remaining} ${item.label}`).join(", ")}
                <span className="block text-sm font-medium text-stone-500">
                  {requestWhen(request.at)}
                  {request.status === "sem_saldo" ? " · sem saldo na fábrica" : ""}
                </span>
              </div>
            ))}
          </PageBoard>
          <Pager
            page={list.page}
            pages={list.pages}
            total={list.total}
            onPage={list.setPage}
            word="pedidos"
          />
        </>
      ) : null}
    </Card>
  );
}
