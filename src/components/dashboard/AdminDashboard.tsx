"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";
import { DemoDataButton } from "@/components/DemoDataButton";
import { PendingRequests } from "@/components/PendingRequests";
import { Card, PageTitle } from "@/components/ui";
import { formatBRL, periodLabel } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  AlertList,
  ChartCard,
  MetricCard,
  MoneyBars,
  PeriodTabs,
  SimpleBars,
  TrendLine,
} from "./shared";
import type { Period } from "@/lib/money";

export function AdminDashboard({
  data,
  period,
  onPeriod,
}: {
  data: DashboardData;
  period: Period;
  onPeriod: (value: Period) => void;
}) {
  const label = periodLabel(period);

  return (
    <div>
      <PageTitle
        title="Visão geral"
        hint="Primeiro o que está faltando. Depois, venda, lucro e perda."
      />

      <Card className="mb-6">
        <p className="text-lg font-extrabold text-stone-900">Relatórios para baixar</p>
        <p className="mt-1 text-stone-600">
          Fechamento do dia, vendas, perdas, envios e estoque. Só a administração imprime ou salva no Excel.
        </p>
        <Link
          href="/relatorios"
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-orange-600 px-4 text-base font-bold text-white hover:bg-orange-700"
        >
          <FileDown className="size-5" />
          Abrir relatórios
        </Link>
      </Card>

      <PendingRequests canSend={false} />

      <section className="mb-8">
        <h2 className="mb-3 text-2xl font-extrabold text-stone-900">Reposição agora</h2>
        <p className="mb-4 text-lg text-stone-600">
          {data.factoryAlerts.length + data.storeAlerts.length > 0
            ? `${data.factoryAlerts.length} na fábrica · ${data.storeAlerts.length} nas lojas`
            : "Nada abaixo do mínimo neste momento."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <AlertList
            title="Lojas precisando de reposição"
            hint="Mande estes itens da fábrica para a loja."
            items={data.storeAlerts}
            empty="As lojas estão abastecidas."
          />
          <AlertList
            title="Fábrica com pouco estoque"
            hint="A fábrica precisa de mais quantidade, para não deixar as lojas sem produto."
            items={data.factoryAlerts}
            empty="A fábrica está abastecida."
          />
        </div>
      </section>

      <PeriodTabs value={period} onChange={onPeriod} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={`Vendeu ${label}`} value={formatBRL(data.revenue)} hint={`${data.salesCount} vendas nas lojas`} />
        <MetricCard label={`Lucro ${label}`} value={formatBRL(data.margin)} />
        <MetricCard
          label="Perdas"
          value={`${data.wasteQty} un.`}
          hint={`${formatBRL(data.wasteRevenue)} deixou de vender`}
          alert={data.wasteQty > 0}
        />
        <MetricCard
          label="Custo das perdas"
          value={formatBRL(data.wasteCost)}
          hint="O que foi gasto para fazer e acabou fora"
          alert={data.wasteCost > 0}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {data.byLocation.map((location) => (
          <Card key={location.id}>
            <p className="text-base font-bold text-stone-500">{location.name}</p>
            <p className="mt-2 text-2xl font-extrabold">{formatBRL(location.revenue)}</p>
            <p className="mt-1 text-stone-600">Lucro {formatBRL(location.margin)}</p>
            <p className={location.wasteQty > 0 ? "mt-1 font-bold text-red-700" : "mt-1 text-stone-600"}>
              Perda {location.wasteQty} un. · {formatBRL(location.wasteRevenue)}
            </p>
          </Card>
        ))}
        <Card>
          <p className="text-base font-bold text-stone-500">Fábrica {label}</p>
          <p className="mt-2 text-2xl font-extrabold">{data.producedQty} feitos</p>
          <p className="mt-1 text-stone-600">{data.sentQty} mandados para as lojas</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Faturamento por loja" empty={data.byLocation.every((item) => item.revenue === 0)}>
          <MoneyBars
            data={data.byLocation.map((item) => ({
              name: item.name,
              Vendeu: item.revenue,
              Lucro: item.margin,
            }))}
            bars={[
              { key: "Vendeu", name: "Vendeu", color: "#ea580c" },
              { key: "Lucro", name: "Lucro", color: "#1c1917" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Perdas por loja (R$)" hint="Quanto cada loja deixou de vender com a sobra." empty={data.wasteRevenue === 0}>
          <MoneyBars
            data={data.byLocation.map((item) => ({
              name: item.name,
              Perdeu: item.wasteRevenue,
              Custo: item.wasteCost,
            }))}
            bars={[
              { key: "Perdeu", name: "Deixou de vender", color: "#b91c1c" },
              { key: "Custo", name: "Custo jogado fora", color: "#7c2d12" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Mais vendidos" empty={data.bestSellers.length === 0}>
          <SimpleBars
            data={data.bestSellers.map((item) => ({ name: item.label, qty: item.qty }))}
            dataKey="qty"
            name="Unidades"
          />
        </ChartCard>
        <ChartCard title="Venda e perda no tempo" empty={data.daily.every((item) => item.receita === 0 && item.perda === 0)}>
          <TrendLine data={data.daily} />
        </ChartCard>
      </div>

      <div className="mt-8 rounded-3xl bg-white p-5 ring-1 ring-stone-200">
        <p className="mb-3 text-lg font-extrabold text-stone-900">Dados de teste</p>
        <DemoDataButton variant="ghost" label="Gerar de novo os dados de exemplo" />
      </div>
    </div>
  );
}
