"use client";

import { PageTitle } from "@/components/ui";
import { formatBRL, periodLabel, type Period } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  ActionGrid,
  AlertList,
  ChartCard,
  ExpiryList,
  MetricCard,
  PeriodTabs,
  SimpleBars,
  TrendLine,
} from "./shared";

export function StoreDashboard({
  data,
  period,
  onPeriod,
  storeName,
}: {
  data: DashboardData;
  period: Period;
  onPeriod: (value: Period) => void;
  storeName: string;
}) {
  const label = periodLabel(period);

  return (
    <div>
      <PageTitle
        title={`Painel da ${storeName}`}
        hint="Venda no caixa e, no fim do dia, lance o que foi frito e não vendeu."
      />
      <ActionGrid
        actions={[
          { href: "/vender", label: "Vender no caixa" },
          { href: "/caixa", label: "Abrir ou fechar o caixa" },
          { href: "/pedir", label: "Pedir para a fábrica" },
          { href: "/sobras", label: "Lançar sobra do dia", className: "bg-stone-900 hover:bg-stone-800" },
        ]}
      />
      <ExpiryList items={data.expiryAlerts} />
      <PeriodTabs value={period} onChange={onPeriod} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={`Vendeu ${label}`} value={formatBRL(data.revenue)} hint={`${data.salesCount} vendas`} />
        <MetricCard label={`Lucro ${label}`} value={formatBRL(data.margin)} />
        <MetricCard
          label="Sobra"
          value={`${data.wasteQty} un.`}
          hint={`${formatBRL(data.wasteRevenue)} que deixou de vender`}
          alert={data.wasteQty > 0}
        />
        <MetricCard
          label="Custo da sobra"
          value={formatBRL(data.wasteCost)}
          hint="Dinheiro gasto no que foi embora"
          alert={data.wasteCost > 0}
        />
      </div>
      {data.expiredQty > 0 ? (
        <div className="mt-4">
          <MetricCard
            label="Descarte por validade"
            value={`${data.expiredQty} un.`}
            hint={`${formatBRL(data.expiredCost)} de custo · ${formatBRL(data.expiredRevenue)} deixou de vender`}
            alert
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Mais vendidos nesta loja" empty={data.bestSellers.length === 0}>
          <SimpleBars
            data={data.bestSellers.map((item) => ({ name: item.label, qty: item.qty }))}
            dataKey="qty"
            name="Unidades"
          />
        </ChartCard>
        <ChartCard title="Como o cliente pagou" empty={data.payments.length === 0}>
          <SimpleBars
            data={data.payments.map((item) => ({ name: item.name, total: item.total }))}
            dataKey="total"
            name="Reais"
            color="#1c1917"
          />
        </ChartCard>
        <ChartCard title="Venda e perda no tempo" empty={data.daily.every((item) => item.receita === 0 && item.perda === 0)}>
          <TrendLine data={data.daily} />
        </ChartCard>
        <ChartCard title="De onde veio a venda" empty={data.channels.length === 0}>
          <SimpleBars
            data={data.channels.map((item) => ({ name: item.name, total: item.total }))}
            dataKey="total"
            name="Reais"
            color="#d97706"
          />
        </ChartCard>
      </div>

      <div className="mt-6">
        <AlertList
          title={`Falta na ${storeName}`}
          hint="Quando chegar neste mínimo, peça para a fábrica mandar mais."
          items={data.storeAlerts}
          empty="Nada faltando nesta loja agora."
        />
      </div>
    </div>
  );
}
