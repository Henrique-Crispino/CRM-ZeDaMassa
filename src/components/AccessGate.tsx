"use client";

import type { ReactNode } from "react";
import { getPanel, type PanelType } from "@/lib/locations";
import { getLocationId } from "@/lib/session";
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
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  if (panel && !allow.includes(panel.type)) {
    return (
      <AppShell>
        <Empty title={title} hint={hint} />
      </AppShell>
    );
  }
  return <>{children}</>;
}
