"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { FactoryDashboard } from "@/components/dashboard/FactoryDashboard";
import { StoreDashboard } from "@/components/dashboard/StoreDashboard";
import { LoadingCard } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { loadDashboard } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import { todayDate } from "@/lib/money";

export default function InicioPage() {
  const ready = useReady();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const [from, setFrom] = useState(() => todayDate());
  const [to, setTo] = useState(() => todayDate());

  const data = useLiveQuery(
    () => (ready && panelId && panel?.type !== "store" ? loadDashboard({ from, to }, panelId) : undefined),
    [ready, from, to, panelId, panel?.type],
  );

  return (
    <AppShell>
      {!panel || !panelId ? (
        <LoadingCard hint="Abrindo o painel..." />
      ) : panel.type === "admin" ? (
        !data ? (
          <LoadingCard hint="Montando a visão da rede..." />
        ) : (
          <AdminDashboard data={data} from={from} to={to} onRange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
        )
      ) : panel.type === "factory" ? (
        !data ? (
          <LoadingCard hint="Montando a fila da fábrica..." />
        ) : (
          <FactoryDashboard data={data} from={from} to={to} onRange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
        )
      ) : (
        <StoreDashboard locationId={panelId} storeName={panel.name} />
      )}
    </AppShell>
  );
}
