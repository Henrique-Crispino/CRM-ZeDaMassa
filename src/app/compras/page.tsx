"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import {
  CompactGroup,
  CompactList,
  CompactRow,
  FilterChips,
  SearchField,
  StickyActionBar,
  matchesKind,
  matchesSearch,
  pickKindOptions,
  type PickKind,
} from "@/components/pick-flow";
import { Pager, usePager } from "@/components/pager";
import { Button, Card, Empty, ErrorBox, Field, Input, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { isPurchased, suggestedPurchaseExpiry } from "@/lib/categories";
import { formatBRL, formatDate, formatTime, parseMoney, todayDate } from "@/lib/money";
import { catalogItems, listPurchaseLogs } from "@/lib/queries";
import { receivePurchase, StockError } from "@/lib/stock";
import { useReady } from "@/lib/use-ready";

type Extra = {
  cost: string;
  expiresAt: string;
};

export default function ComprasPage() {
  const ready = useReady();
  const items = useLiveQuery(
    () => (ready ? catalogItems().then((rows) => rows.filter((item) => isPurchased(item.product.category))) : []),
    [ready],
  );
  const logs = useLiveQuery(() => (ready ? listPurchaseLogs(80) : []), [ready]);
  const logsPage = usePager(logs ?? [], 8);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [receivedAt, setReceivedAt] = useState(todayDate());
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () =>
      (items ?? [])
        .filter((item) => (qty[item.niche.id] ?? 0) > 0)
        .map((item) => ({
          item,
          qty: qty[item.niche.id] ?? 0,
          cost: extra[item.niche.id]?.cost ?? String(item.niche.costPrice).replace(".", ","),
          expiresAt: extra[item.niche.id]?.expiresAt ?? suggestedPurchaseExpiry(receivedAt, item.product),
        })),
    [items, qty, extra, receivedAt],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);

  function expiryOf(nicheId: string, perishable: boolean, shelfLifeDays: number) {
    const typed = extra[nicheId]?.expiresAt;
    if (typed) return typed;
    return suggestedPurchaseExpiry(receivedAt, { perishable, shelfLifeDays });
  }

  const visible = useMemo(() => {
    return (items ?? []).filter((item) => {
      if (!matchesKind(item.product.category, kind, (qty[item.niche.id] ?? 0) > 0)) return false;
      return matchesSearch(item.label, search);
    });
  }, [items, kind, qty, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = map.get(item.product.id) ?? [];
      list.push(item);
      map.set(item.product.id, list);
    }
    return [...map.values()];
  }, [visible]);

  function patchExtra(nicheId: string, patch: Partial<Extra>, fallbackCost: number) {
    setExtra((current) => ({
      ...current,
      [nicheId]: {
        cost: current[nicheId]?.cost ?? String(fallbackCost).replace(".", ","),
        expiresAt: current[nicheId]?.expiresAt ?? "",
        ...patch,
      },
    }));
  }

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      const missingDate = selected.find(
        (row) => row.item.product.perishable && !row.expiresAt,
      );
      if (missingDate) {
        throw new StockError(
          `${missingDate.item.product.name} é perecível. Informe a validade do lote.`,
        );
      }
      const beforeEntry = selected.find(
        (row) => row.item.product.perishable && row.expiresAt && row.expiresAt < receivedAt,
      );
      if (beforeEntry) {
        throw new StockError(
          `A validade de ${beforeEntry.item.product.name} não pode ser antes do dia da entrada.`,
        );
      }
      await receivePurchase({
        receivedAt,
        items: selected.map((row) => ({
          nicheId: row.item.niche.id,
          qty: row.qty,
          unitCost: parseMoney(row.cost),
          expiresAt: row.expiresAt || undefined,
        })),
      });
      setQty({});
      setExtra({});
      setOk("Entrada lançada. O que chegou já está no estoque da fábrica, com o custo desta compra.");
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para lançar a compra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="A compra entra na fábrica"
      hint="A loja recebe o que a fábrica manda. Quem dá entrada de mercadoria é a fábrica ou a administração."
    >
      <AppShell>
        <div className="pb-36">
          <PageTitle
            title="Entrada de mercadoria"
            hint="Coca, detergente e embalagem não se produzem. Bebida perecível precisa da data do lote."
          />

          <div className="mb-4 max-w-xs">
            <Field label="Data da entrada" hint="O dia em que a mercadoria chegou.">
              <Input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
            </Field>
          </div>

          <div className="mb-4 space-y-3">
            <SearchField value={search} onChange={setSearch} placeholder="Buscar: coca, detergente, copo..." />
            <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
          </div>

          {!items?.length ? (
            <Empty
              title="Cadastre o que se compra"
              hint="Bebida, limpeza, descartável e embalagem. Salgado não entra aqui."
            />
          ) : grouped.length === 0 ? (
            <Empty title="Nada com esse nome" hint="Tente outro trecho ou limpe a busca." />
          ) : (
            <CompactList>
              {grouped.map((group) => (
                <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                  {group.map((item) => {
                    const amount = qty[item.niche.id] ?? 0;
                    const cost = extra[item.niche.id]?.cost ?? String(item.niche.costPrice).replace(".", ",");
                    const expiresAt = expiryOf(
                      item.niche.id,
                      item.product.perishable,
                      item.product.shelfLifeDays,
                    );
                    return (
                      <div key={item.niche.id}>
                        <CompactRow
                          title={item.niche.name}
                          hint={
                            item.product.perishable
                              ? `Custo atual: ${formatBRL(item.niche.costPrice)} · perecível`
                              : `Custo atual do tipo: ${formatBRL(item.niche.costPrice)}`
                          }
                          selected={amount > 0}
                        >
                          <NumberStepper
                            size="sm"
                            value={amount}
                            onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                          />
                        </CompactRow>
                        {amount > 0 ? (
                          <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2">
                            <Field label="Custo desta compra" hint="Grava no lote. O tipo continua com o preço de cadastro.">
                              <Input
                                inputMode="decimal"
                                value={cost}
                                onChange={(event) =>
                                  patchExtra(item.niche.id, { cost: event.target.value }, item.niche.costPrice)
                                }
                              />
                            </Field>
                            <Field
                              label={item.product.perishable ? "Validade do lote" : "Validade (se tiver)"}
                              hint={
                                item.product.perishable
                                  ? "Obrigatória. Use a data do rótulo. Os dias do cadastro só sugerem."
                                  : "Deixe vazio se não vence."
                              }
                            >
                              <Input
                                type="date"
                                value={expiresAt}
                                onChange={(event) =>
                                  patchExtra(item.niche.id, { expiresAt: event.target.value }, item.niche.costPrice)
                                }
                              />
                            </Field>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </CompactGroup>
              ))}
            </CompactList>
          )}

          <h2 className="mb-3 mt-10 text-2xl font-extrabold">Últimas entradas</h2>
          {!logs?.length ? (
            <Empty title="Nenhuma compra lançada ainda" />
          ) : (
            <div ref={logsPage.listRef} className="scroll-mt-36 space-y-3">
              {logsPage.rows.map((log) => (
                <Card key={log.refId}>
                  <p className="font-extrabold text-stone-900">
                    {formatDate(log.madeAt)} · {formatTime(log.at)} · {log.totalQty} un.
                  </p>
                  <p className="text-stone-600">
                    {log.items.map((item) => `${item.qty}× ${item.label}${item.expiresAt ? ` · vale ${formatDate(item.expiresAt)}` : ""}`).join(" · ")}
                  </p>
                </Card>
              ))}
              <Pager
                page={logsPage.page}
                pages={logsPage.pages}
                total={logsPage.total}
                onPage={logsPage.setPage}
                word="entradas"
              />
            </div>
          )}
        </div>

        <StickyActionBar>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-stone-700">
              {selected.length > 0 ? `${selected.length} tipos · ${selectedUnits} un.` : "Nada lançado ainda"}
            </p>
            <Button disabled={saving || selected.length === 0} onClick={save}>
              {saving ? "Salvando..." : "Guardar no estoque"}
            </Button>
          </div>
        </StickyActionBar>
      </AppShell>
    </AccessGate>
  );
}
