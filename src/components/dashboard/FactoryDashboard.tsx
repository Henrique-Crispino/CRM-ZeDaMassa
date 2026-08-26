"use client";

import { DateRangeFilter } from "@/components/DateRangeFilter";
import { PendingRequests } from "@/components/PendingRequests";
import { Card, PageTitle } from "@/components/ui";
import { formatBRL, rangePhrase } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  ActionGrid,
  AlertList,
  ChartCard,
  ExpiryList,
  MetricCard,
  MetricGrid,
  MoneyBars,
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

  return (
    <div>
      <PageTitle
        title="Fábrica"
        hint="Produza, mande para as lojas e veja o que está faltando — na câmara da fábrica e em cada loja."
      />
      <ActionGrid
        actions={[
          { href: "/produzir", label: "Registrar o que foi feito" },
          { href: "/enviar", label: "Mandar para a loja" },
          { href: "/receber", label: "Ver o que está em trânsito" },
          { href: "/producao", label: "Ver registro de produção" },
        ]}
      />

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
          value={`${data.clienteQty} un.`}
          hint={`${formatBRL(data.clienteCost)} de custo do lote · não passou no caixa`}
        />
        <MetricCard
          label="Lojas venderam"
          value={formatBRL(data.revenue)}
          hint={`Lucro ${formatBRL(data.margin)}`}
        />
        <MetricCard
          label="Sobra das lojas"
          value={`${data.wasteQty} un.`}
          hint={`${formatBRL(data.wasteRevenue)} deixou de vender · custo ${formatBRL(data.wasteCost)}`}
          alert={data.wasteQty > 0}
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
      </MetricGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="O que cada loja vendeu" empty={data.byLocation.every((item) => item.revenue === 0)}>
          <MoneyBars
            data={data.byLocation.map((item) => ({ name: item.name, Vendeu: item.revenue }))}
            bars={[{ key: "Vendeu", name: "Vendeu", color: "#ea580c" }]}
          />
        </ChartCard>
        <ChartCard title="Mais vendido nas lojas" empty={data.bestSellers.length === 0}>
          <SimpleBars
            data={data.bestSellers.map((item) => ({ name: item.label, qty: item.qty }))}
            dataKey="qty"
            name="Unidades"
          />
        </ChartCard>
      </div>

      {data.byLocation.length > 0 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.byLocation.map((location) => (
            <Card key={location.id}>
              <p className="text-lg font-extrabold">{location.name}</p>
              <p className="mt-2 text-stone-700">Vendeu {formatBRL(location.revenue)}</p>
              <p className={location.wasteQty > 0 ? "font-bold text-red-700" : "text-stone-700"}>
                Perdeu {location.wasteQty} un. ({formatBRL(location.wasteRevenue)})
              </p>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
