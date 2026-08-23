"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { FactoryDashboard } from "@/components/dashboard/FactoryDashboard";
import { StoreDashboard } from "@/components/dashboard/StoreDashboard";
import { getPanel } from "@/lib/locations";
import { loadDashboard } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import type { Period } from "@/lib/money";

export default function InicioPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const [period, setPeriod] = useState<Period>("today");

  const data = useLiveQuery(
    () => (ready && panelId ? loadDashboard(period, panelId) : undefined),
    [ready, period, panelId],
  );

  return (
    <AppShell>
      {!data || !panel ? (
        <p className="text-xl font-bold text-stone-500">Carregando o painel...</p>
      ) : panel.type === "admin" ? (
        <AdminDashboard data={data} period={period} onPeriod={setPeriod} />
      ) : panel.type === "factory" ? (
        <FactoryDashboard data={data} period={period} onPeriod={setPeriod} />
      ) : (
        <StoreDashboard data={data} period={period} onPeriod={setPeriod} storeName={panel.name} />
      )}
    </AppShell>
  );
}
