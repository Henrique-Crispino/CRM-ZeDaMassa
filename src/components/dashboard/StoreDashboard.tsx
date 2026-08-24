"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { DiscardExpiredBanner } from "@/components/DiscardExpiredBanner";
import { Card, PageTitle } from "@/components/ui";
import { currentCashSession, cashPeriodLabel } from "@/lib/cash";
import { expiryAlertsFor } from "@/lib/queries";
import { useReady } from "@/lib/use-ready";
import { ActionGrid } from "./shared";

export function StoreDashboard({
  locationId,
  storeName,
}: {
  locationId: string;
  storeName: string;
}) {
  const ready = useReady();
  const session = useLiveQuery(
    () => (ready ? currentCashSession(locationId) : undefined),
    [ready, locationId],
  );
  const expiry = useLiveQuery(
    () => (ready ? expiryAlertsFor(locationId) : []),
    [ready, locationId],
  );
  const expiredHere = (expiry ?? []).filter((item) => item.level === "expired");

  return (
    <div>
      <PageTitle
        title={storeName}
        hint="Venda no caixa e, no fim do dia, lance o que foi frito e não vendeu. Gráfico e canal ficam na administração."
      />
      <ActionGrid
        actions={[
          { href: "/vender", label: "Vender no caixa" },
          { href: "/caixa", label: "Abrir ou fechar o caixa" },
          { href: "/pedir", label: "Pedir para a fábrica" },
          { href: "/receber", label: "Conferir o que chegou" },
          { href: "/sobras", label: "Lançar sobra do dia", className: "bg-stone-900 hover:bg-stone-800" },
        ]}
      />

      {session === undefined ? (
        <Card className="mb-6">
          <p className="text-lg font-bold text-stone-600">Carregando o caixa...</p>
        </Card>
      ) : session ? (
        <Card className="mb-6 bg-emerald-50 ring-emerald-200">
          <p className="text-sm font-bold uppercase text-emerald-800">Caixa aberto</p>
          <p className="mt-1 text-2xl font-extrabold text-stone-900">
            {cashPeriodLabel(session.period)} · {session.employeeName}
          </p>
          <p className="text-stone-700">As vendas deste turno ficam neste movimento.</p>
          <Link href="/caixa" className="mt-3 inline-flex min-h-12 items-center font-bold text-emerald-800">
            Ver o turno
          </Link>
        </Card>
      ) : (
        <Card className="mb-6 bg-red-50 ring-red-200">
          <p className="font-extrabold text-red-800">O caixa desta loja está fechado.</p>
          <p className="mt-1 text-stone-700">Abra o período da manhã ou da tarde antes de vender.</p>
          <Link
            href="/caixa"
            className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-red-600 px-4 font-bold text-white"
          >
            Abrir caixa
          </Link>
        </Card>
      )}

      <DiscardExpiredBanner
        items={expiredHere}
        hint="Lote vencido não vende. Descarte aqui — sem ir ao estoque no começo do turno."
      />
    </div>
  );
}
