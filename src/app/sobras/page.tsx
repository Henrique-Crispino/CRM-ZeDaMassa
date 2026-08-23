"use client";

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
  matchesSearch,
  pickKindOptions,
  type PickKind,
} from "@/components/pick-flow";
import { Button, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { stockByLocation } from "@/lib/queries";
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

  const available = useMemo(
    () => (stock ?? []).filter((item) => (item.qty[locationId ?? ""] ?? 0) > 0),
    [stock, locationId],
  );

  const selected = useMemo(
    () =>
      available
        .map((item) => ({ item, qty: qty[item.niche.id] ?? 0 }))
        .filter((row) => row.qty > 0),
    [available, qty],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);

  const visible = useMemo(() => {
    return available.filter((item) => {
      if (kind === "salgado" || kind === "bebida") {
        if (item.product.category !== kind) return false;
      }
      if (kind === "pedido" && !(qty[item.niche.id] > 0)) return false;
      return matchesSearch(item.label, search);
    });
  }, [available, kind, qty, search]);

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
          hint="Abra o painel da Loja 1 ou da Loja 2 para lançar o que foi frito e não vendeu."
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
      setOk("Sobra lançada. Esses itens saíram do estoque da loja.");
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para lançar. Confira as quantidades.");
      setConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="pb-36">
        <PageTitle
          title="Sobra do dia"
          hint="Busque o que sobrou, coloque a quantidade e confira antes de baixar o estoque."
        />

        <div className="mb-4 space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
        </div>

        {!available.length ? (
          <Empty
            title="Esta loja está sem estoque"
            hint="Quando a fábrica mandar os salgados, eles aparecem aqui."
          />
        ) : grouped.length === 0 ? (
          <Empty title="Nada com esse nome" hint="Tente outro trecho ou limpe a busca." />
        ) : (
          <CompactList>
            {grouped.map((group) => (
              <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                {group.map((item) => (
                  <CompactRow
                    key={item.niche.id}
                    title={item.niche.name}
                    hint={`Na loja: ${item.qty[locationId ?? ""]} un.`}
                    selected={(qty[item.niche.id] ?? 0) > 0}
                  >
                    <NumberStepper
                      size="sm"
                      value={qty[item.niche.id] ?? 0}
                      max={item.qty[locationId ?? ""] ?? 0}
                      onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                    />
                  </CompactRow>
                ))}
              </CompactGroup>
            ))}
          </CompactList>
        )}
      </div>

      <StickyActionBar>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selected.length > 0 ? `${selected.length} tipos · ${selectedUnits} un.` : "Nada lançado ainda"}
          </p>
          <Button disabled={selected.length === 0} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e baixar
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title="Baixar estas sobras?"
        hint="Isso tira do estoque e entra como perda do dia."
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
