"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import {
  CompactGroup,
  CompactList,
  CompactRow,
  ConfirmDialog,
  SearchField,
  StickyActionBar,
  matchesSearch,
} from "@/components/pick-flow";
import { Button, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { isClosedPackage } from "@/lib/categories";
import { getPanel } from "@/lib/locations";
import { sellableQty, stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { openPackages, StockError } from "@/lib/stock";
import { productIsLive } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function PacotePage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const place = locationId ?? "";
  const packages = useMemo(
    () =>
      (stock ?? []).filter((item) => {
        if (!place) return false;
        if (!productIsLive(item.product) || !isClosedPackage(item.product.category)) return false;
        return sellableQty(item, place) > 0;
      }),
    [stock, place],
  );

  const selected = useMemo(
    () =>
      packages
        .map((item) => ({ item, qty: qty[item.niche.id] ?? 0 }))
        .filter((row) => row.qty > 0),
    [packages, qty],
  );
  const selectedUnits = selected.reduce((sum, row) => sum + row.qty, 0);

  const visible = useMemo(
    () => packages.filter((item) => matchesSearch(item.label, search)),
    [packages, search],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = map.get(item.product.id) ?? [];
      list.push(item);
      map.set(item.product.id, list);
    }
    return [...map.values()];
  }, [visible]);

  async function save() {
    if (!locationId) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await openPackages({
        locationId,
        items: selected.map((row) => ({ nicheId: row.item.niche.id, qty: row.qty })),
      });
      setQty({});
      setConfirm(false);
      setOk("Pacote aberto. O estoque caiu em pacotes fechados. O extrato registra a baixa.");
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para baixar. Confira as quantidades.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate
      allow={["factory", "store"]}
      title="Abrir pacote é da fábrica e da loja"
      hint="Embalagem e descartável saem daqui, não do caixa."
    >
      <AppShell>
        <div className="pb-36">
          <PageTitle
            title="Abrir pacote"
            hint="Copo, marmita e embalagem não vendem no caixa. Quando abrir um pacote para usar, baixe 1 pacote aqui. Não é copo solto."
          />

          {packages.length ? (
            <div className="mb-4">
              <SearchField value={search} onChange={setSearch} placeholder="Buscar: copo, marmita..." />
            </div>
          ) : null}

          {!packages.length ? (
            <Empty
              title="Não tem pacote neste lugar"
              hint="Compre na fábrica e mande para a loja. O saldo é em pacote fechado."
            />
          ) : grouped.length === 0 ? (
            <Empty title="Nada com esse nome" hint="Tente copo, marmita ou limpe a busca." />
          ) : (
            <CompactList>
              {grouped.map((group) => (
                <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                  {group.map((item) => {
                    const available = sellableQty(item, place);
                    return (
                      <CompactRow
                        key={item.niche.id}
                        title={item.niche.name}
                        hint={`${available} pacote${available === 1 ? "" : "s"} aqui`}
                        selected={(qty[item.niche.id] ?? 0) > 0}
                      >
                        <NumberStepper
                          size="sm"
                          value={qty[item.niche.id] ?? 0}
                          max={available}
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
          <SuccessBox message={ok} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-stone-700">
              {selected.length > 0 ? `${selectedUnits} pacote${selectedUnits === 1 ? "" : "s"}` : "Nada marcado"}
            </p>
            <Button
              disabled={selected.length === 0}
              onClick={() => {
                setOk("");
                setConfirm(true);
              }}
            >
              Revisar e abrir
            </Button>
          </div>
        </StickyActionBar>

        <ConfirmDialog
          open={confirm}
          title="Abrir estes pacotes?"
          hint="O estoque cai nesta quantidade de pacotes. Não vira copo solto no cupom."
          confirmLabel="Confirmar baixa"
          busy={saving}
          onConfirm={save}
          onCancel={() => setConfirm(false)}
        >
          <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
            {selected.map((row) => (
              <li key={row.item.niche.id} className="flex justify-between gap-3 py-3">
                <span className="font-bold text-stone-800">{row.item.label}</span>
                <span className="font-extrabold text-stone-900">{row.qty} pacote{row.qty === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      </AppShell>
    </AccessGate>
  );
}
