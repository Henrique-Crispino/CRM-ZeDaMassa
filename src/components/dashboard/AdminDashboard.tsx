"use client";

import Link from "next/link";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PendingRequests } from "@/components/PendingRequests";
import { OpenParties } from "@/components/OpenParties";
import { Button, Card, PageTitle, cn } from "@/components/ui";
import { formatBRL, rangePhrase } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  AlertList,
  ChartCard,
  ExpiryList,
  MetricCard,
  MetricGrid,
  MoneyBars,
  SimpleBars,
  TrendLine,
} from "./shared";

export function AdminDashboard({
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
  const [showCharts, setShowCharts] = useState(false);

  return (
    <div>
      <PageTitle
        title="Visão geral"
        hint="Primeiro o dinheiro: venda da loja, o que a padaria pagou na fábrica, e a perda. Reposição e validade vêm depois."
      />

      <Card className="mb-6 hidden md:block">
        <DateRangeFilter
          from={from}
          to={to}
          onChange={onRange}
          fromHint="Venda, perda e o que saiu da câmara."
          toHint="Inclui este dia."
        />
      </Card>

      <MetricGrid>
        <MetricCard label={`Vendeu ${label}`} value={formatBRL(data.revenue)} hint={`${data.salesCount} vendas nas lojas`} />
        <MetricCard
          label="Compra na fábrica"
          value={formatBRL(data.clienteRevenue)}
          hint={`${data.clienteQty} un. · custo ${formatBRL(data.clienteCost)} · pago na fábrica, não na loja`}
        />
        <MetricCard label={`Lucro ${label}`} value={formatBRL(data.margin)} />
        <MetricCard
          label={`Sobra ${label}`}
          value={`${data.wasteQty} un.`}
          hint={`${formatBRL(data.wasteRevenue)} deixou de vender`}
          alert={data.wasteQty > 0}
        />
      </MetricGrid>

      <div className="mt-4 hidden gap-4 md:grid sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Custo das perdas"
          value={formatBRL(data.wasteCost)}
          hint={`Sobra do dia · ${data.wasteQty} un. · ${formatBRL(data.wasteRevenue)} deixou de vender`}
          alert={data.wasteCost > 0}
        />
        <MetricCard
          label="Descarte por validade"
          value={`${data.expiredQty} un.`}
          hint={
            data.expiredQty > 0
              ? `${formatBRL(data.expiredCost)} de custo · ${formatBRL(data.expiredRevenue)} deixou de vender`
              : "Nada descartado neste recorte."
          }
          alert={data.expiredQty > 0}
        />
      </div>

      <OpenParties />

      <PendingRequests canSend={false} />

      <div className="mb-4 md:hidden">
        <Button type="button" variant="ghost" className="w-full" onClick={() => setShowCharts((open) => !open)}>
          {showCharts ? "Esconder gráficos e lojas" : "Ver gráficos, lojas e recorte de datas"}
        </Button>
      </div>

      <div className={cn(!showCharts && "hidden md:block")}>
        <Card className="mb-6 md:hidden">
          <DateRangeFilter
            from={from}
            to={to}
            onChange={onRange}
            fromHint="Venda, perda e o que saiu da câmara."
            toHint="Inclui este dia."
          />
        </Card>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          <p className="mt-1 text-stone-600">
            {data.clienteQty} cliente levou · {formatBRL(data.clienteRevenue)} na fábrica · custo{" "}
            {formatBRL(data.clienteCost)}
          </p>
        </Card>
      </div>

      <div className={cn("mt-6 grid gap-4 lg:grid-cols-2", !showCharts && "hidden md:grid")}>
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
        <ChartCard title="Sobra por loja (R$)" hint="Quanto cada loja deixou de vender com a sobra do dia. Descarte por validade fica no card da grade." empty={data.wasteRevenue === 0}>
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
        <ChartCard title="Como pagaram" empty={data.payments.length === 0}>
          <SimpleBars
            data={data.payments.map((item) => ({ name: item.name, total: item.total }))}
            dataKey="total"
            name="Reais"
            color="#d97706"
          />
        </ChartCard>
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
      </div>
      </div>

      <Card className="mb-8 mt-8">
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

      <ExpiryList items={data.expiryAlerts} />

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
    </div>
  );
}
