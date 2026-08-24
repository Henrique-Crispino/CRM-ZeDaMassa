"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Input, PageTitle, SuccessBox } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { catalogItems } from "@/lib/queries";
import { useReady } from "@/lib/use-ready";

export default function PromocoesPage() {
  const ready = useReady();
  const items = useLiveQuery(() => (ready ? catalogItems(false) : []), [ready]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function toggle(nicheId: string, allowed: boolean) {
    setError("");
    setOk("");
    const item = (items ?? []).find((row) => row.niche.id === nicheId);
    if (!item) return;
    const typed = prices[nicheId] ?? String(item.niche.promoPrice || "").replace(".", ",");
    const promoPrice = Number(typed.replace(",", "."));
    if (allowed && (!Number.isFinite(promoPrice) || promoPrice <= 0)) {
      setError("Informe o preço da promoção antes de liberar.");
      return;
    }
    await getDb().niches.update(nicheId, { promoAllowed: allowed, promoPrice: allowed ? promoPrice : item.niche.promoPrice });
    setOk(allowed ? `${item.label} liberado para promoção.` : `${item.label} saiu da promoção.`);
  }

  async function savePrice(nicheId: string) {
    const item = (items ?? []).find((row) => row.niche.id === nicheId);
    if (!item) return;
    const promoPrice = Number((prices[nicheId] ?? String(item.niche.promoPrice)).replace(",", "."));
    if (!Number.isFinite(promoPrice) || promoPrice <= 0) {
      setError("O preço da promoção precisa ser maior que zero.");
      return;
    }
    await getDb().niches.update(nicheId, { promoPrice });
    setOk(`Preço promocional de ${item.label} salvo.`);
  }

  return (
    <AccessGate
      allow={["admin"]}
      title="Promoção é decisão da administração"
      hint="Só o admin libera o produto e define o preço que a loja pode usar."
    >
      <AppShell>
        <PageTitle
          title="Promoções"
          hint="Escolha o que pode entrar em promoção e o preço. Na loja, o caixa só aplica se estiver liberado aqui."
        />
        <ErrorBox message={error} />
        <SuccessBox message={ok} />

        {!items?.length ? (
          <Empty title="Cadastre produtos primeiro" hint="Sem produto, não tem promoção." />
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const value = prices[item.niche.id] ?? String(item.niche.promoPrice || "").replace(".", ",");
              return (
                <Card key={item.niche.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-extrabold text-stone-900">{item.label}</p>
                      <p className="text-stone-600">Preço normal {formatBRL(item.niche.sellPrice)}</p>
                    </div>
                    <Button
                      type="button"
                      variant={item.niche.promoAllowed ? "primary" : "ghost"}
                      className="min-h-12"
                      onClick={() => toggle(item.niche.id, !item.niche.promoAllowed)}
                    >
                      {item.niche.promoAllowed ? "Liberado" : "Bloqueado"}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Input
                      inputMode="decimal"
                      value={value}
                      onChange={(event) => setPrices((current) => ({ ...current, [item.niche.id]: event.target.value }))}
                      placeholder="Preço na promoção"
                    />
                    <Button type="button" variant="soft" onClick={() => savePrice(item.niche.id)}>
                      Salvar preço
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
