"use client";

import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { getPanel, type PanelType } from "@/lib/locations";
import { personCanUsePanel } from "@/lib/people";
import { getActorId, getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import { AppShell } from "./AppShell";
import { Empty } from "./ui";

export function AccessGate({
  allow,
  title,
  hint,
  children,
}: {
  allow: PanelType[];
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const ready = useReady();
  const actorId = ready ? getActorId() : null;
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const person = useLiveQuery(() => (actorId ? getDb().employees.get(actorId) : undefined), [actorId]);
  if (panel && !allow.includes(panel.type)) {
    return (
      <AppShell>
        <Empty title={title} hint={hint} />
      </AppShell>
    );
  }
  if (panel && person && !personCanUsePanel(person, panel.id)) {
    return (
      <AppShell>
        <Empty
          title={`Isto não é da ${person.name}`}
          hint="Sai e entra de novo com quem opera este lugar. A Telma não abre a administração."
        />
      </AppShell>
    );
  }
  return <>{children}</>;
}
