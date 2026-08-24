"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import {
  CompactGroup,
  CompactList,
  CompactRow,
  ConfirmDialog,
  FilterChips,
  SearchField,
  StickyActionBar,
  matchesKind,
  matchesSearch,
  pickKindOptions,
  type PickKind,
} from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { sellableQty, stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { registerWaste, StockError } from "@/lib/stock";
import { useReady } from "@/lib/use-ready";

export default function SobrasPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const place = locationId ?? "";
  const expiredUnits = useMemo(
    () => (stock ?? []).reduce((sum, item) => sum + (place ? (item.expiredQty[place] ?? 0) : 0), 0),
    [stock, place],
  );
  const leftoverable = useMemo(
    () => (stock ?? []).filter((item) => place && sellableQty(item, place) > 0),
    [stock, place],
  );
  const expiredOnly = useMemo(
    () =>
      (stock ?? []).filter((item) => {
        if (!place) return false;
        return (item.expiredQty[place] ?? 0) > 0 && sellableQty(item, place) === 0;
      }),
    [stock, place],
  );

  const selected = useMemo(
    () =>
      leftoverable
        .map((item) => ({ item, qty: qty[item.niche.id] ?? 0 }))
        .filter((row) => row.qty > 0),
    [leftoverable, qty],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);

  const visible = useMemo(() => {
    return leftoverable.filter((item) => {
      if (!matchesKind(item.product.category, kind, (qty[item.niche.id] ?? 0) > 0)) return false;
      return matchesSearch(item.label, search);
    });
  }, [leftoverable, kind, qty, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = map.get(item.product.id) ?? [];
      list.push(item);
      map.set(item.product.id, list);
    }
    return [...map.values()];
  }, [visible]);

  if (panel && panel.type !== "store") {
    return (
      <AppShell>
        <Empty
          title="A sobra é lançada na loja"
          hint="Abra o painel da loja para lançar o que foi frito e não vendeu."
        />
      </AppShell>
    );
  }

  async function save() {
    if (!locationId) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await registerWaste({
        locationId,
        items: selected.map((row) => ({ nicheId: row.item.niche.id, qty: row.qty })),
      });
      setQty({});
      setConfirm(false);
      setOk("Sobra lançada. Esses itens saíram do estoque da loja. Lote vencido continua no estoque até o descarte.");
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para lançar. Confira as quantidades.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="pb-36">
        <PageTitle
          title="Sobra do dia"
          hint="Só o que ainda vale. Lote vencido não é sobra — descarte no estoque."
        />

        {expiredUnits > 0 ? (
          <Card className="mb-4 bg-red-50 ring-red-200">
            <p className="font-extrabold text-red-800">{expiredUnits} un. vencidas nesta loja</p>
            <p className="mt-1 text-stone-700">
              Isso não entra na sobra do dia. Descarte no estoque para baixar a quantidade e marcar como perda por validade.
            </p>
            <Link
              href="/estoque"
              className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-red-600 px-4 font-bold text-white"
            >
              Ir ao estoque para descartar
            </Link>
          </Card>
        ) : null}

        <div className="mb-4 space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
        </div>

        {!leftoverable.length ? (
          <Empty
            title={expiredOnly.length ? "Nada válido para lançar como sobra" : "Esta loja está sem estoque"}
            hint={
              expiredOnly.length
                ? "O que restou já venceu. Descarte no estoque. Sobra é só o que foi frito e ainda valia."
                : "Quando a fábrica mandar os salgados, eles aparecem aqui."
            }
            action={
              expiredOnly.length ? (
                <Link
                  href="/estoque"
                  className="inline-flex min-h-14 items-center rounded-2xl bg-red-600 px-5 text-lg font-bold text-white"
                >
                  Descartar vencidos
                </Link>
              ) : undefined
            }
          />
        ) : grouped.length === 0 ? (
          <Empty title="Nada com esse nome" hint="Tente outro trecho ou limpe a busca." />
        ) : (
          <CompactList>
            {grouped.map((group) => (
              <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                {group.map((item) => {
                  const valid = sellableQty(item, place);
                  const expired = item.expiredQty[place] ?? 0;
                  return (
                    <CompactRow
                      key={item.niche.id}
                      title={item.niche.name}
                      hint={
                        expired > 0
                          ? `Para sobra: ${valid} un. · ${expired} vencidas (descarte no estoque)`
                          : `Na loja: ${valid} un.`
                      }
                      selected={(qty[item.niche.id] ?? 0) > 0}
                    >
                      <NumberStepper
                        size="sm"
                        value={qty[item.niche.id] ?? 0}
                        max={valid}
                        onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                      />
                    </CompactRow>
                  );
                })}
              </CompactGroup>
            ))}
          </CompactList>
        )}
      </div>

      <StickyActionBar>
        <ErrorBox message={error} />
        {error.includes("Descarte") ? (
          <Link href="/estoque" className="inline-flex min-h-12 items-center font-bold text-red-700">
            Abrir estoque para descartar vencidos
          </Link>
        ) : null}
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selected.length > 0 ? `${selected.length} tipos · ${selectedUnits} un.` : "Nada lançado ainda"}
          </p>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              setOk("");
              setConfirm(true);
            }}
          >
            Revisar e baixar
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title="Baixar estas sobras?"
        hint="Sobra tira só o que ainda vale. Lote vencido fica no estoque até o descarte."
        confirmLabel="Confirmar baixa"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {selected.map((row) => (
            <li key={row.item.niche.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">{row.item.label}</span>
              <span className="font-extrabold">{row.qty} un.</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-lg font-extrabold">Total: {selectedUnits} unidades</p>
      </ConfirmDialog>
    </AppShell>
  );
}
