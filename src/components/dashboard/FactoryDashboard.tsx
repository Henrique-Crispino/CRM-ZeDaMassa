"use client";

import { PendingRequests } from "@/components/PendingRequests";
import { Card, PageTitle } from "@/components/ui";
import { formatBRL, periodLabel, type Period } from "@/lib/money";
import type { DashboardData } from "@/lib/queries";
import {
  ActionGrid,
  AlertList,
  ChartCard,
  ExpiryList,
  MetricCard,
  MoneyBars,
  PeriodTabs,
  SimpleBars,
} from "./shared";

export function FactoryDashboard({
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

      <PeriodTabs value={period} onChange={onPeriod} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={`Feitos ${label}`} value={`${data.producedQty} un.`} />
        <MetricCard label={`Mandados ${label}`} value={`${data.sentQty} un.`} hint="Já saíram da fábrica" />
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
        <ChartCard title="O que cada loja vendeu" empty={data.byLocation.every((item) => item.revenue === 0)}>
          <MoneyBars
            data={data.byLocation.map((item) => ({ name: item.name, Vendeu: item.revenue }))}
            bars={[{ key: "Vendeu", name: "Vendeu", color: "#ea580c" }]}
          />
        </ChartCard>
        <ChartCard title="Mais pedidos pelas lojas" empty={data.bestSellers.length === 0}>
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
