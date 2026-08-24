"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Pager, usePager } from "@/components/pager";
import { Button, Card, Empty, ErrorBox, Field, Input, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { isSoldAtRegister } from "@/lib/categories";
import { ComboError, listCombos, removeCombo, saveCombo } from "@/lib/combos";
import { getDb } from "@/lib/db";
import { formatBRL, formatDate, formatTime } from "@/lib/money";
import { catalogItems } from "@/lib/queries";
import { comboStatus, promoStatus, promoStatusLabel, productIsLive } from "@/lib/types";
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

const emptyCombo = {
  id: "",
  name: "",
  price: "",
  enabled: true,
  from: "",
  to: "",
  qtys: {} as Record<string, number>,
};

export default function PromocoesPage() {
  const ready = useReady();
  const items = useLiveQuery(() => (ready ? catalogItems(false) : []), [ready]);
  const combos = useLiveQuery(() => (ready ? listCombos() : []), [ready]);
  const list = usePager(items ?? [], 8);
  const combosPage = usePager(combos ?? [], 8);
  const [tab, setTab] = useState<"produtos" | "combos">("produtos");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [froms, setFroms] = useState<Record<string, string>>({});
  const [tos, setTos] = useState<Record<string, string>>({});
  const [comboForm, setComboForm] = useState(emptyCombo);
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
          hint="Preço de um produto ou combo de vários. Toda promoção tem início e fim. Depois do fim, a loja não aplica mais."
        />
        <div className="mb-6 flex flex-wrap gap-2">
          <Button type="button" variant={tab === "produtos" ? "primary" : "ghost"} onClick={() => setTab("produtos")}>
            Por produto
          </Button>
          <Button type="button" variant={tab === "combos" ? "primary" : "ghost"} onClick={() => setTab("combos")}>
            Combos
          </Button>
        </div>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />

        {tab === "produtos" ? (
          !items?.length ? (
          <Empty title="Cadastre produtos primeiro" hint="Sem produto, não tem promoção." />
        ) : (
          <div ref={list.listRef} className="mt-4 scroll-mt-36 space-y-3">
            {list.rows.map((item) => {
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
            <Pager
              page={list.page}
              pages={list.pages}
              total={list.total}
              onPage={list.setPage}
              word="produtos"
            />
          </div>
        )
        ) : (
          <>
            <p className="mb-4 max-w-2xl text-base leading-relaxed text-stone-600">
              O combo tem um preço só. Na venda a loja baixa cada produto do estoque. Se faltar um, o combo inteiro
              para — não vende metade.
            </p>
            <Card className="mb-6 space-y-4">
              <Field label="Nome do combo">
                <Input
                  value={comboForm.name}
                  onChange={(event) => setComboForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: 10 mini + Coca"
                />
              </Field>
              <Field label="Preço do combo">
                <Input
                  inputMode="decimal"
                  value={comboForm.price}
                  onChange={(event) => setComboForm((current) => ({ ...current, price: event.target.value }))}
                  placeholder="18,00"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Começa">
                  <Input
                    type="datetime-local"
                    value={comboForm.from || defaultFrom()}
                    onChange={(event) => setComboForm((current) => ({ ...current, from: event.target.value }))}
                  />
                </Field>
                <Field label="Termina">
                  <Input
                    type="datetime-local"
                    value={comboForm.to || defaultTo()}
                    onChange={(event) => setComboForm((current) => ({ ...current, to: event.target.value }))}
                  />
                </Field>
              </div>
              <div>
                <p className="mb-2 font-bold">O que entra neste combo</p>
                <p className="mb-2 text-sm text-stone-500">Pelo menos dois. A quantidade é o que sai do estoque em cada venda.</p>
                <div className="space-y-2">
                  {(items ?? [])
                    .filter(
                      (item) =>
                        productIsLive(item.product) &&
                        item.niche.active &&
                        isSoldAtRegister(item.product.category),
                    )
                    .map((item) => (
                      <div key={item.niche.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3">
                        <p className="font-bold">{item.label}</p>
                        <NumberStepper
                          value={comboForm.qtys[item.niche.id] ?? 0}
                          onChange={(value) =>
                            setComboForm((current) => ({
                              ...current,
                              qtys: { ...current.qtys, [item.niche.id]: value },
                            }))
                          }
                        />
                      </div>
                    ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={comboForm.enabled ? "primary" : "ghost"}
                  onClick={() => setComboForm((current) => ({ ...current, enabled: !current.enabled }))}
                >
                  {comboForm.enabled ? "Combo ligado" : "Combo desligado"}
                </Button>
                <Button
                  onClick={async () => {
                    setError("");
                    setOk("");
                    try {
                      await saveCombo({
                        id: comboForm.id || undefined,
                        name: comboForm.name,
                        price: Number(comboForm.price.replace(",", ".")),
                        enabled: comboForm.enabled,
                        promoFrom: fromLocalInput(comboForm.from || defaultFrom()),
                        promoTo: fromLocalInput(comboForm.to || defaultTo()),
                        items: Object.entries(comboForm.qtys).map(([nicheId, qty]) => ({ nicheId, qty })),
                      });
                      setComboForm({ ...emptyCombo, from: defaultFrom(), to: defaultTo() });
                      setOk(comboForm.id ? "Combo atualizado." : "Combo salvo. A loja vê enquanto estiver na vigência.");
                    } catch (err) {
                      setError(err instanceof ComboError ? err.message : "Não deu para salvar o combo.");
                    }
                  }}
                >
                  {comboForm.id ? "Salvar combo" : "Criar combo"}
                </Button>
                {comboForm.id ? (
                  <Button type="button" variant="ghost" onClick={() => setComboForm({ ...emptyCombo, from: defaultFrom(), to: defaultTo() })}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </Card>

            {!combos?.length ? (
              <Empty title="Nenhum combo ainda" hint="Monte um: 10 coxinha mini + 1 coca, com preço e data de validade." />
            ) : (
              <div ref={combosPage.listRef} className="scroll-mt-36 space-y-3">
                {combosPage.rows.map((combo) => {
                  const status = comboStatus(combo);
                  return (
                    <Card key={combo.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-extrabold">{combo.name}</p>
                        <p className="text-sm font-semibold text-stone-500">
                          {formatBRL(combo.price)} · {combo.items.map((item) => `${item.qty}× ${item.label}`).join(" + ")}
                        </p>
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
                          {combo.promoTo && status !== "off"
                            ? ` · até ${formatDate(combo.promoTo)} ${formatTime(combo.promoTo)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-12"
                          onClick={() => {
                            setComboForm({
                              id: combo.id,
                              name: combo.name,
                              price: String(combo.price).replace(".", ","),
                              enabled: combo.enabled,
                              from: toLocalInput(combo.promoFrom),
                              to: toLocalInput(combo.promoTo),
                              qtys: Object.fromEntries(combo.items.map((item) => [item.nicheId, item.qty])),
                            });
                            setOk("");
                            setError("");
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          className="min-h-12"
                          onClick={async () => {
                            await removeCombo(combo.id);
                            if (comboForm.id === combo.id) setComboForm({ ...emptyCombo, from: defaultFrom(), to: defaultTo() });
                            setOk("Combo removido.");
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </Card>
                  );
                })}
                <Pager
                  page={combosPage.page}
                  pages={combosPage.pages}
                  total={combosPage.total}
                  onPage={combosPage.setPage}
                  word="combos"
                />
              </div>
            )}
          </>
        )}
      </AppShell>
    </AccessGate>
  );
}
