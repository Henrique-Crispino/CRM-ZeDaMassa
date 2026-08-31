"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PendingRequests } from "@/components/PendingRequests";
import { Button, Card, PageTitle, cn } from "@/components/ui";
import { formatBRL, rangePhrase } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  ActionGrid,
  AlertList,
  ChartCard,
  ExpiryList,
  MetricCard,
  MetricGrid,
  SimpleBars,
} from "./shared";

export function FactoryDashboard({
  data,
  from,
  to,
  onRange,
}: {
  data: DashboardData;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
}) {
  const label = rangePhrase(from, to);
  const [showNumbers, setShowNumbers] = useState(false);

  const priority = useMemo(() => {
    if (data.storeAlerts.length > 0) {
      return {
        href: "/enviar",
        label: "Mandar para a loja agora",
        hint: `${data.storeAlerts.length} item(ns) pedindo reposição.`,
      };
    }
    if (data.factoryAlerts.length > 0) {
      return {
        href: "/produzir",
        label: "Produzir o que falta",
        hint: `${data.factoryAlerts.length} item(ns) abaixo do mínimo na câmara.`,
      };
    }
    return {
      href: "/produzir",
      label: "Registrar o que foi feito",
      hint: "Sem fila urgente — produza ou mande quando precisar.",
    };
  }, [data.factoryAlerts.length, data.storeAlerts.length]);

  return (
    <div>
      <PageTitle
        title="Fábrica"
        hint="Produza, mande para as lojas e veja o que está faltando — na câmara e no estoque. O dinheiro das lojas fica na administração. O que o cliente pagou na câmara aparece aqui."
      />

      <Card className="mb-4 bg-orange-50 ring-orange-200 md:hidden">
        <p className="font-semibold text-stone-700">{priority.hint}</p>
        <Link
          href={priority.href}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-orange-600 px-4 text-base font-bold text-white hover:bg-orange-700"
        >
          {priority.label}
        </Link>
      </Card>

      <div className="hidden md:block">
        <ActionGrid
          actions={[
            { href: "/produzir", label: "Registrar o que foi feito" },
            { href: "/enviar", label: "Mandar para a loja" },
            { href: "/receber", label: "Ver o que está em trânsito" },
            { href: "/producao", label: "Ver registro de produção" },
          ]}
        />
      </div>

      <PendingRequests canSend />

      <ExpiryList items={data.expiryAlerts} />

      <section className="mb-8">
        <h2 className="mb-3 text-2xl font-extrabold text-stone-900">Reposição agora</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <AlertList
            title="Loja pedindo reposição"
            hint="Estes itens já estão baixos na loja. Mande agora."
            items={data.storeAlerts}
            empty="Nenhuma loja está pedindo reposição."
          />
          <AlertList
            title="Fábrica precisa produzir"
            hint="O mínimo da fábrica é maior de propósito: ela abastece as duas lojas."
            items={data.factoryAlerts}
            empty="Estoque da fábrica ok."
          />
        </div>
      </section>

      <div className="mb-4 md:hidden">
        <Button type="button" variant="ghost" className="w-full" onClick={() => setShowNumbers((open) => !open)}>
          {showNumbers ? "Esconder números do período" : "Ver números e gráficos do período"}
        </Button>
      </div>

      <div className={cn(!showNumbers && "hidden md:block")}>
        <Card className="mb-6">
          <DateRangeFilter
            from={from}
            to={to}
            onChange={onRange}
            fromHint="Produção, envio e o que o cliente levou da câmara."
            toHint="Inclui este dia."
          />
        </Card>

        <MetricGrid>
          <MetricCard label={`Feitos ${label}`} value={`${data.producedQty} un.`} />
          <MetricCard label={`Para as lojas ${label}`} value={`${data.sentQty} un.`} hint="Envio da câmara" />
          <MetricCard
            label="Cliente levou"
            value={formatBRL(data.clienteRevenue)}
            hint={`${data.clienteQty} un. · custo ${formatBRL(data.clienteCost)} · pagou na fábrica`}
          />
          <MetricCard
            label="Sobra das lojas"
            value={`${data.wasteQty} un.`}
            hint={data.wasteQty > 0 ? `Custo do lote ${formatBRL(data.wasteCost)}` : "Nada neste recorte."}
            alert={data.wasteQty > 0}
          />
          <MetricCard
            label="Descarte por validade"
            value={`${data.expiredQty} un.`}
            hint={
              data.expiredQty > 0
                ? `${formatBRL(data.expiredCost)} de custo do lote`
                : "Nada descartado neste recorte."
            }
            alert={data.expiredQty > 0}
          />
        </MetricGrid>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Para onde saiu a câmara"
            hint="Unidades. Cliente levou pagou na fábrica, não na loja."
            empty={data.sentQty === 0 && data.clienteQty === 0}
          >
            <SimpleBars
              data={[
                { name: "Para as lojas", qty: data.sentQty },
                { name: "Cliente levou", qty: data.clienteQty },
              ]}
              dataKey="qty"
              name="Unidades"
              labelWidth={128}
              showValues
            />
          </ChartCard>
          <ChartCard
            title="Mais vendido nas lojas"
            hint="Unidades. Para saber o que fritar — sem o R$ da loja."
            empty={data.bestSellers.length === 0}
          >
            <SimpleBars
              data={data.bestSellers.map((item) => ({ name: item.label, qty: item.qty }))}
              dataKey="qty"
              name="Unidades"
            />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
