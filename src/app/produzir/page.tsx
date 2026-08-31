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
import { Button, Card, Empty, ErrorBox, Field, Input, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { isManufactured } from "@/lib/categories";
import { getPanel } from "@/lib/locations";
import { todayDate } from "@/lib/money";
import { catalogItems } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { produceItems, StockError } from "@/lib/stock";
import { useReady } from "@/lib/use-ready";

export default function ProduzirPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const items = useLiveQuery(
    () =>
      ready
        ? catalogItems().then((rows) => rows.filter((item) => isManufactured(item.product.category)))
        : undefined,
    [ready],
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [madeAt, setMadeAt] = useState(todayDate());
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const selected = useMemo(
    () => Object.entries(qty).filter(([, value]) => value > 0),
    [qty],
  );
  const selectedUnits = selected.reduce((sum, [, value]) => sum + value, 0);

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

  if (panel && panel.type !== "factory") {
    return (
      <AppShell>
        <Empty
          title="Essa tela é da fábrica"
          hint="Abra o painel da Fábrica para registrar o que foi feito."
        />
      </AppShell>
    );
  }

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await produceItems({
        madeAt,
        items: selected.map(([nicheId, value]) => ({ nicheId, qty: value })),
      });
      setQty({});
      setConfirm(false);
      setOk("Pronto. O que foi feito já entrou no estoque da fábrica.");
    } catch (err) {
      setError(err instanceof StockError ? err.message : "Não deu para salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="pb-36">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="O que foi feito hoje?"
          hint="Só o que a fábrica faz. Bebida, limpeza e embalagem entram em Compras."
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/compras"
            className="inline-flex min-h-12 items-center rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300"
          >
            Ir para compras
          </Link>
          <Link
            href="/producao"
            className="inline-flex min-h-12 items-center rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300"
          >
            Ver registro
          </Link>
        </div>
        </div>

        <div className="mb-4 max-w-xs">
          <Field label="Data em que foi feito">
            <Input type="date" value={madeAt} onChange={(event) => setMadeAt(event.target.value)} />
          </Field>
        </div>

        <div className="mb-4 space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, kibe..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selected.length)} />
        </div>

        {!ready || items === undefined ? (
          <Card className="mb-4">
            <p className="font-extrabold text-stone-600">Carregando produtos...</p>
          </Card>
        ) : !items.length ? (
          <Empty
            title="Cadastre os produtos primeiro"
            hint="Sem produto cadastrado, não dá para registrar a produção."
            action={
              <Link
                href="/produtos/novo"
                className="inline-flex min-h-14 items-center rounded-2xl bg-orange-600 px-5 text-lg font-bold text-white"
              >
                Cadastrar produto
              </Link>
            }
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
                    selected={(qty[item.niche.id] ?? 0) > 0}
                  >
                    <NumberStepper
                      size="sm"
                      value={qty[item.niche.id] ?? 0}
                      onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                    />
                  </CompactRow>
                ))}
              </CompactGroup>
            ))}
          </CompactList>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Guardar no estoque?"
        hint={`${selected.length} tipos · ${selectedUnits} un. na data ${madeAt}.`}
        confirmLabel={saving ? "Salvando..." : "Sim, guardar"}
        busy={saving}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (saving) return;
          void save();
        }}
      />

      <StickyActionBar>
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selected.length > 0 ? `${selected.length} tipos · ${selectedUnits} un.` : "Nada lançado ainda"}
          </p>
          <Button disabled={saving || selected.length === 0} onClick={() => setConfirm(true)}>
            {saving ? "Salvando..." : "Guardar no estoque"}
          </Button>
        </div>
      </StickyActionBar>
    </AppShell>
  );
}
