"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatBRL, formatDate, formatTime } from "@/lib/money";
import { catalogItems } from "@/lib/queries";
import { promoStatus, promoStatusLabel } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function defaultFrom() {
  return toLocalInput(new Date().toISOString());
}

function defaultTo() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return toLocalInput(date.toISOString());
}

export default function PromocoesPage() {
  const ready = useReady();
  const items = useLiveQuery(() => (ready ? catalogItems(false) : []), [ready]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [froms, setFroms] = useState<Record<string, string>>({});
  const [tos, setTos] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function priceOf(nicheId: string, fallback: number) {
    const typed = prices[nicheId] ?? String(fallback || "").replace(".", ",");
    return Number(typed.replace(",", "."));
  }

  async function save(nicheId: string, allowed: boolean) {
    setError("");
    setOk("");
    const item = (items ?? []).find((row) => row.niche.id === nicheId);
    if (!item) return;
    const promoPrice = priceOf(nicheId, item.niche.promoPrice);
    if (allowed && (!Number.isFinite(promoPrice) || promoPrice <= 0)) {
      setError("Informe o preço da promoção antes de liberar.");
      return;
    }
    const promoFrom = fromLocalInput(froms[nicheId] ?? toLocalInput(item.niche.promoFrom) ?? defaultFrom());
    const promoTo = fromLocalInput(tos[nicheId] ?? toLocalInput(item.niche.promoTo) ?? defaultTo());
    if (allowed && (!promoFrom || !promoTo)) {
      setError("Promoção precisa de início e fim. Sem isso ela fica ligada para sempre.");
      return;
    }
    if (allowed && promoFrom && promoTo && new Date(promoFrom) >= new Date(promoTo)) {
      setError("O fim tem que ser depois do início.");
      return;
    }
    await getDb().niches.update(nicheId, {
      promoAllowed: allowed,
      promoPrice: allowed ? promoPrice : item.niche.promoPrice,
      promoFrom: allowed ? promoFrom : item.niche.promoFrom,
      promoTo: allowed ? promoTo : item.niche.promoTo,
      promoOnlyExpiringToday: item.niche.promoOnlyExpiringToday ?? false,
    });
    setOk(
      allowed
        ? `${item.label} liberado até ${formatDate(promoTo ?? "")} ${formatTime(promoTo ?? "")}.`
        : `${item.label} saiu da promoção.`,
    );
  }

  async function saveWindow(nicheId: string) {
    const item = (items ?? []).find((row) => row.niche.id === nicheId);
    if (!item) return;
    await save(nicheId, item.niche.promoAllowed);
    if (item.niche.promoAllowed) setOk(`Vigência de ${item.label} salva.`);
  }

  async function toggleExpireToday(nicheId: string) {
    const item = (items ?? []).find((row) => row.niche.id === nicheId);
    if (!item) return;
    setError("");
    await getDb().niches.update(nicheId, {
      promoOnlyExpiringToday: !item.niche.promoOnlyExpiringToday,
    });
    setOk(
      !item.niche.promoOnlyExpiringToday
        ? `${item.label}: promoção só no que vence hoje.`
        : `${item.label}: promoção vale para qualquer lote na validade.`,
    );
  }

  return (
    <AccessGate
      allow={["admin"]}
      title="Promoção é decisão da administração"
      hint="Só o admin libera o produto, o preço e até quando vale."
    >
      <AppShell>
        <PageTitle
          title="Promoções"
          hint="Toda promoção tem início e fim. Depois do fim, a loja não aplica mais — mesmo que o interruptor tenha ficado ligado."
        />
        <ErrorBox message={error} />
        <SuccessBox message={ok} />

        {!items?.length ? (
          <Empty title="Cadastre produtos primeiro" hint="Sem produto, não tem promoção." />
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const value = prices[item.niche.id] ?? String(item.niche.promoPrice || "").replace(".", ",");
              const status = promoStatus(item.niche);
              return (
                <Card key={item.niche.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-extrabold text-stone-900">{item.label}</p>
                      <p className="text-stone-600">Preço normal {formatBRL(item.niche.sellPrice)}</p>
                      <p
                        className={
                          status === "live"
                            ? "font-bold text-emerald-800"
                            : status === "ended"
                              ? "font-bold text-red-700"
                              : "font-semibold text-stone-500"
                        }
                      >
                        {promoStatusLabel(status)}
                        {item.niche.promoTo && status !== "off"
                          ? ` · até ${formatDate(item.niche.promoTo)} ${formatTime(item.niche.promoTo)}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={item.niche.promoAllowed ? "primary" : "ghost"}
                      className="min-h-12"
                      onClick={() => save(item.niche.id, !item.niche.promoAllowed)}
                    >
                      {item.niche.promoAllowed ? "Liberado" : "Bloqueado"}
                    </Button>
                  </div>
                  <Input
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => setPrices((current) => ({ ...current, [item.niche.id]: event.target.value }))}
                    placeholder="Preço na promoção"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Começa">
                      <Input
                        type="datetime-local"
                        value={froms[item.niche.id] ?? toLocalInput(item.niche.promoFrom) ?? defaultFrom()}
                        onChange={(event) => setFroms((current) => ({ ...current, [item.niche.id]: event.target.value }))}
                      />
                    </Field>
                    <Field label="Termina">
                      <Input
                        type="datetime-local"
                        value={tos[item.niche.id] ?? toLocalInput(item.niche.promoTo) ?? defaultTo()}
                        onChange={(event) => setTos((current) => ({ ...current, [item.niche.id]: event.target.value }))}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="soft" onClick={() => saveWindow(item.niche.id)}>
                      Salvar preço e vigência
                    </Button>
                    <Button
                      type="button"
                      variant={item.niche.promoOnlyExpiringToday ? "secondary" : "ghost"}
                      onClick={() => toggleExpireToday(item.niche.id)}
                    >
                      {item.niche.promoOnlyExpiringToday ? "Só o que vence hoje" : "Qualquer lote na validade"}
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
