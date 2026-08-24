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
  matchesKind,
  pickKindOptions,
  type PickKind,
} from "@/components/pick-flow";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  NumberStepper,
  PageTitle,
  SuccessBox,
} from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { catalogItems, sellableQty, stockByLocation } from "@/lib/queries";
import { createStoreRequest, listRequests, RequestError } from "@/lib/requests";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";


export default function PedirPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const catalog = useLiveQuery(() => (ready ? catalogItems() : []), [ready]);
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const mine = useLiveQuery(
    () => (ready && locationId ? listRequests().then((rows) => rows.filter((row) => row.fromLocationId === locationId)) : []),
    [ready, locationId],
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
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
  const selectedCount = selected.length;
  const selectedUnits = selected.reduce((sum, [, value]) => sum + value, 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog ?? []).filter((item) => {
      if (!matchesKind(item.product.category, kind, (qty[item.niche.id] ?? 0) > 0)) return false;
      if (q && !item.label.toLowerCase().includes(q) && !item.product.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [catalog, kind, qty, search]);

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
          title="Essa tela é da loja"
          hint="A fábrica e o admin recebem o pedido. Quem pede é quem está no caixa."
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
      await createStoreRequest({
        fromLocationId: locationId,
        note,
        items: selected.map(([nicheId, value]) => ({ nicheId, qty: value })),
      });
      setQty({});
      setNote("");
      setSearch("");
      setKind("todos");
      setConfirm(false);
      setOk("Pedido enviado. A fábrica e o admin já foram avisados.");
    } catch (err) {
      setConfirm(false);
      setError(err instanceof RequestError ? err.message : "Não deu para enviar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="pb-44">
        <PageTitle
          title="Pedir para a fábrica"
          hint="Veja quanto a fábrica tem de válido agora. Se pedir mais, o pedido fica — mas não mente que vai sair tudo."
        />

        <div className="mb-4 space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selectedCount)} />
        </div>

        {!catalog?.length ? (
          <Empty title="Cadastre os produtos primeiro" hint="Sem produto, não tem o que pedir." />
        ) : grouped.length === 0 ? (
          <Empty
            title="Nada com esse nome"
            hint="Tente outro trecho: mini, festa, refrigerante."
            action={
              <Button type="button" variant="ghost" onClick={() => { setSearch(""); setKind("todos"); }}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <CompactList>
            {grouped.map((group) => (
              <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                {group.map((item) => {
                  const row = stock?.find((entry) => entry.niche.id === item.niche.id);
                  const here = row?.qty[locationId ?? ""] ?? 0;
                  const factory = row ? sellableQty(row, "factory") : 0;
                  const chosen = qty[item.niche.id] ?? 0;
                  return (
                    <CompactRow
                      key={item.niche.id}
                      title={item.niche.name}
                      hint={`Na loja: ${here} · fábrica tem ${factory} válidas`}
                      selected={chosen > 0}
                    >
                      <NumberStepper
                        size="sm"
                        value={chosen}
                        onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                      />
                    </CompactRow>
                  );
                })}
              </CompactGroup>
            ))}
          </CompactList>
        )}

        {(mine ?? []).length > 0 ? (
          <details className="mt-8 rounded-3xl bg-white p-4 ring-1 ring-stone-200">
            <summary className="cursor-pointer text-lg font-extrabold text-stone-900">
              Pedidos já feitos ({mine?.length})
            </summary>
            <div className="mt-3 space-y-3">
              {mine?.slice(0, 8).map((request) => (
                <Card key={request.id} className="p-4">
                  <p className="font-extrabold">
                    {request.statusLabel}
                  </p>
                  <ul className="mt-1 text-stone-700">
                    {request.items.map((item) => (
                      <li key={item.nicheId}>
                        {item.label} · pediu {item.qty}
                        {item.sentQty > 0 ? ` · mandou ${item.sentQty}` : ""}
                        {request.status !== "sent" && request.status !== "cancelled"
                          ? ` · fábrica ${item.factoryQty}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <StickyActionBar>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Recado opcional. Ex.: festa no sábado"
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-orange-500"
        />
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selectedCount > 0 ? `${selectedCount} tipos · ${selectedUnits} un.` : "Nada escolhido ainda"}
          </p>
          <Button className="min-w-48" disabled={selectedCount === 0} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e enviar
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title="Enviar este pedido?"
        hint={
          selected.some(([nicheId, value]) => {
            const row = stock?.find((entry) => entry.niche.id === nicheId);
            const factory = row ? sellableQty(row, "factory") : 0;
            return factory < value;
          })
            ? "A fábrica não tem tudo isso agora. O pedido fica registrado, mas pode não sair inteiro."
            : "A fábrica e o admin vão receber o aviso. O saldo da fábrica aparece no pedido."
        }
        confirmLabel="Confirmar pedido"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {selected.map(([nicheId, value]) => {
            const found = catalog?.find((item) => item.niche.id === nicheId);
            const row = stock?.find((entry) => entry.niche.id === nicheId);
            const factory = row ? sellableQty(row, "factory") : 0;
            return (
              <li key={nicheId} className="flex justify-between gap-3 py-3">
                <span className="font-bold text-stone-800">{found?.label ?? "Produto"}</span>
                <span className="font-extrabold">
                  {value} un.
                  <span className={`block text-sm font-semibold ${factory < value ? "text-red-700" : "text-stone-500"}`}>
                    fábrica {factory}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {note ? <p className="mt-3 text-stone-600">Recado: {note}</p> : null}
        <p className="mt-3 text-lg font-extrabold">Total: {selectedUnits} unidades</p>
      </ConfirmDialog>
    </AppShell>
  );
}
