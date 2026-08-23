"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { loadDemoData } from "@/lib/seed";

export function DemoDataButton({
  variant = "ghost",
  label = "Carregar dados de exemplo",
}: {
  variant?: "ghost" | "soft" | "secondary";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className="w-full sm:w-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setDone(false);
          try {
            await loadDemoData();
            setDone(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Colocando os dados..." : label}
      </Button>
      {done ? (
        <p className="text-sm font-semibold text-emerald-700">
          Pronto. Abra um painel: já tem vendas, perdas, estoque e alertas dos últimos 30 dias.
        </p>
      ) : (
        <p className="text-sm text-stone-500">
          Substitui o que está neste computador por dados de teste (fábrica, 2 lojas, 30 dias).
        </p>
      )}
    </div>
  );
}
