"use client";

import type { ReactNode } from "react";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { CashWorkspace } from "@/components/caixa/workspace";

export default function CaixaLayout({ children }: { children: ReactNode }) {
  return (
    <AccessGate
      allow={["store", "admin"]}
      title="O caixa é da loja"
      hint="Cada loja abre e fecha o próprio caixa. A administração reabre o do dia se o apurado saiu errado."
    >
      <AppShell>
        <CashWorkspace>{children}</CashWorkspace>
      </AppShell>
    </AccessGate>
  );
}
