"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { Button, Card, cn } from "@/components/ui";
import { LotExpiryBoard } from "@/components/LotExpiryBoard";
import type { AlertItem, DashboardData, ExpiryAlert } from "@/lib/queries";
import { formatBRL, type Period } from "@/lib/money";

const COLORS = ["#ea580c", "#1c1917", "#d97706", "#b91c1c", "#047857", "#7c2d12"];

export function PeriodTabs({
  value,
  onChange,
}: {
  value: Period;
  onChange: (value: Period) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {(
        [
          ["today", "Hoje"],
          ["week", "7 dias"],
          ["month", "30 dias"],
        ] as const
      ).map(([id, label]) => (
        <Button
          key={id}
          type="button"
          variant={value === id ? "primary" : "ghost"}
          className="min-h-12"
          onClick={() => onChange(id)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "ring-red-200" : undefined}>
      <p className="text-base font-bold text-stone-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${alert ? "text-red-600" : "text-stone-900"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm font-semibold text-stone-500">{hint}</p> : null}
    </Card>
  );
}

export function ChartCard({
  title,
  hint,
  children,
  empty,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <Card>
      <h3 className="text-xl font-extrabold text-stone-900">{title}</h3>
      {hint ? <p className="mt-1 text-stone-600">{hint}</p> : null}
      {empty ? (
        <p className="mt-8 text-center text-lg font-semibold text-stone-500">Ainda sem dados neste período.</p>
      ) : (
        <div className="mt-4 h-72">{children}</div>
      )}
    </Card>
  );
}

function moneyTick(value: number) {
  return formatBRL(value);
}

export function MoneyBars({
  data,
  bars,
}: {
  data: Array<Record<string, string | number>>;
  bars: { key: string; name: string; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => moneyTick(Number(value))} />
        <Legend />
        {bars.map((bar) => (
          <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[8, 8, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({
  data,
  dataKey,
  name,
  color = "#ea580c",
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  name: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 8, 8, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data }: { data: DashboardData["daily"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => moneyTick(Number(value))} />
        <Legend />
        <Line type="monotone" dataKey="receita" name="Vendeu" stroke="#ea580c" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="perda" name="Perdeu (R$)" stroke="#b91c1c" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AlertList({
  title,
  hint,
  items,
  empty,
}: {
  title: string;
  hint?: string;
  items: AlertItem[];
  empty: string;
}) {
  const list = usePager(items, 6, `${title}:${items.length}:${items[0]?.nicheId ?? ""}`);
  return (
    <Card>
      <h3 className="text-xl font-extrabold text-stone-900">{title}</h3>
      {hint ? <p className="mt-1 text-stone-600">{hint}</p> : null}
      {items.length === 0 ? (
        <p className="mt-4 text-lg font-semibold text-emerald-700">{empty}</p>
      ) : (
        <>
          <PageBoard size={list.size} rowMin="4.75rem" className="mt-4">
            {list.rows.map((item) => (
              <div
                key={`${item.locationId}-${item.nicheId}`}
                className="rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100"
              >
                <p className="font-extrabold text-stone-900">{item.label}</p>
                <p className="text-red-700">
                  {item.locationName}: tem {item.qty} · precisa de {item.min} · falta {item.missing}
                </p>
              </div>
            ))}
          </PageBoard>
          <Pager
            page={list.page}
            pages={list.pages}
            total={list.total}
            onPage={list.setPage}
            word="itens"
          />
        </>
      )}
    </Card>
  );
}

export function ExpiryList({ items }: { items: ExpiryAlert[] }) {
  const expired = items.filter((item) => item.level === "expired").length;
  if (items.length === 0) return null;
  return (
    <div className="mb-8">
      <LotExpiryBoard items={items} compact />
      {expired > 0 ? (
        <Link
          href="/estoque"
          className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-red-600 px-4 text-base font-bold text-white hover:bg-red-700"
        >
          Ir ao estoque para descartar vencidos
        </Link>
      ) : (
        <Link
          href="/estoque"
          className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300"
        >
          Ver validade no estoque
        </Link>
      )}
    </div>
  );
}

export function ActionGrid({
  actions,
}: {
  actions: { href: string; label: string; className?: string }[];
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className={cn(
            "flex min-h-20 items-center justify-center rounded-3xl bg-orange-600 px-5 text-center text-xl font-extrabold text-white hover:bg-orange-700",
            action.className,
          )}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
