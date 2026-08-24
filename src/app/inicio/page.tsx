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
    () => (ready && panelId && panel?.type !== "store" ? loadDashboard(period, panelId) : undefined),
    [ready, period, panelId, panel?.type],
  );

  return (
    <AppShell>
      {!panel || !panelId ? (
        <p className="text-xl font-bold text-stone-500">Carregando...</p>
      ) : panel.type === "admin" ? (
        !data ? (
          <p className="text-xl font-bold text-stone-500">Carregando...</p>
        ) : (
          <AdminDashboard data={data} period={period} onPeriod={setPeriod} />
        )
      ) : panel.type === "factory" ? (
        !data ? (
          <p className="text-xl font-bold text-stone-500">Carregando...</p>
        ) : (
          <FactoryDashboard data={data} period={period} onPeriod={setPeriod} />
        )
      ) : (
        <StoreDashboard locationId={panelId} storeName={panel.name} />
      )}
    </AppShell>
  );
}
