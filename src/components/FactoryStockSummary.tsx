"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Pager, usePager } from "@/components/pager";
import { Card } from "@/components/ui";
import { factoryStockPosition } from "@/lib/requests";
import { useReady } from "@/lib/use-ready";

export function FactoryStockSummary({ pageSize = 6 }: { pageSize?: number }) {
  const ready = useReady();
  const rows = useLiveQuery(() => (ready ? factoryStockPosition() : []), [ready]);
  const page = usePager(rows ?? [], pageSize);

  if (!rows?.length) return null;

  return (
    <Card className="mb-4">
      <p className="font-extrabold text-stone-900">Saldo na câmara</p>
      <p className="mt-1 text-sm text-stone-600">
        Físico · válido · reservado na fila · livre para envio avulso · em trânsito para loja
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="pb-2 pr-4 font-bold">Produto</th>
              <th className="pb-2 px-2 font-bold">Físico</th>
              <th className="pb-2 px-2 font-bold">Válido</th>
              <th className="pb-2 px-2 font-bold">Reservado</th>
              <th className="pb-2 px-2 font-bold">Livre</th>
              <th className="pb-2 pl-2 font-bold">Trânsito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {page.rows.map((row) => (
              <tr key={row.nicheId}>
                <td className="py-2 pr-4 font-semibold text-stone-800">{row.label}</td>
                <td className="px-2 py-2 font-extrabold tabular-nums">{row.physical}</td>
                <td className="px-2 py-2 font-extrabold tabular-nums text-emerald-800">{row.sellable}</td>
                <td className="px-2 py-2 font-extrabold tabular-nums text-orange-800">{row.reserved}</td>
                <td className="px-2 py-2 font-extrabold tabular-nums text-stone-900">{row.free}</td>
                <td className="py-2 pl-2 font-extrabold tabular-nums text-sky-800">{row.inTransit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page.page} pages={page.pages} total={page.total} onPage={page.setPage} word="produtos" />
    </Card>
  );
}
