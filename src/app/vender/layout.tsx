"use client";

import type { ReactNode } from "react";
import { AccessGate } from "@/components/AccessGate";

export default function VenderLayout({ children }: { children: ReactNode }) {
  return (
    <AccessGate
      allow={["store"]}
      requireCash="store-only"
      title="A venda é na loja"
      hint="Abra o painel de uma loja para vender no caixa."
    >
      {children}
    </AccessGate>
  );
}
