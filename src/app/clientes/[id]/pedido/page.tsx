"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useParams, useRouter } from "next/navigation";
import { AccessGate } from "@/components/AccessGate";
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
  type PickKind,
} from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import { isSoldAtRegister, saleKindOptions } from "@/lib/categories";
import { getCustomer } from "@/lib/customers";
import {
  createFactoryOrder,
  FactoryOrderError,
  lastFactoryOrder,
  listFactoryOrders,
} from "@/lib/factory-orders";
import { catalogItems } from "@/lib/queries";
import { factoryFreeByNiche } from "@/lib/requests";
import { customerKind } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function SepararPedidoPage() {
  const ready = useReady();
  const router = useRouter();
  const customerId = String(useParams().id ?? "");
  const customer = useLiveQuery(
    () => (ready && customerId ? getCustomer(customerId).then((row) => row ?? null) : undefined),
    [ready, customerId],
  );
  const catalog = useLiveQuery(() => (ready ? catalogItems() : []), [ready]);
  const free = useLiveQuery(() => (ready ? factoryFreeByNiche() : new Map<string, number>()), [ready]);
  const mine = useLiveQuery(
    () => (ready && customerId ? listFactoryOrders().then((rows) => rows.filter((row) => row.customerId === customerId)) : []),
    [ready, customerId],
  );
  const last = useLiveQuery(
    () => (ready && customerId ? lastFactoryOrder(customerId) : null),
    [ready, customerId],
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const sellable = useMemo(
    () => (catalog ?? []).filter((item) => isSoldAtRegister(item.product.category)),
    [catalog],
  );
  const selected = useMemo(() => Object.entries(qty).filter(([, value]) => value > 0), [qty]);
  const selectedCount = selected.length;
  const selectedUnits = selected.reduce((sum, [, value]) => sum + value, 0);
  const kindOptions = useMemo(
    () => [
      ...saleKindOptions(),
      { id: "pedido" as const, label: selectedCount ? `Escolhidos (${selectedCount})` : "Escolhidos" },
    ],
    [selectedCount],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellable.filter((item) => {
      if (!matchesKind(item.product.category, kind, (qty[item.niche.id] ?? 0) > 0)) return false;
      if (q && !item.label.toLowerCase().includes(q) && !item.product.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [kind, qty, search, sellable]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = map.get(item.product.id) ?? [];
      list.push(item);
      map.set(item.product.id, list);
    }
    return [...map.values()];
  }, [visible]);

  const volume = customer ? customerKind(customer) === "volume" : false;

  function repeatLast() {
    if (!last?.length) return;
    const next: Record<string, number> = {};
    for (const item of last) next[item.nicheId] = item.qty;
    setQty(next);
    setKind("pedido");
    setError("");
    setOk("Copiei o último pedido. Confira se a câmara aguenta hoje — ainda não gravei.");
  }

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await createFactoryOrder({
        customerId,
        note,
        items: selected.map(([nicheId, value]) => ({ nicheId, qty: value })),
      });
      router.push("/pedidos");
    } catch (err) {
      setConfirm(false);
      setError(err instanceof FactoryOrderError ? err.message : "Não deu para montar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Pedido da câmara fica na fábrica"
      hint="A loja não monta pedido de cliente. Quem separa é a fábrica."
    >
      <AppShell>
        {customer === undefined ? (
          <p className="font-extrabold text-stone-600">Carregando o cliente...</p>
        ) : customer === null ? (
          <Empty title="Cliente não encontrado" hint="Volte à lista e escolha de novo." />
        ) : !volume ? (
          <Empty
            title={`${customer.name} é festa ou retirada`}
            hint="Só quem está marcado como compra na fábrica monta pedido da câmara."
          />
        ) : (
          <div className="pb-44">
            <PageTitle
              title={customer ? `Separar para ${customer.name}` : "Separar pedido"}
              hint="Isto reserva o poço da câmara junto com o pedido da loja. Ainda não baixa estoque."
            />

            <div className="mb-4 space-y-3">
              <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
              <FilterChips value={kind} onChange={setKind} options={kindOptions} />
            </div>

            {!sellable.length ? (
              <Empty title="Cadastre os produtos primeiro" hint="Só salgado e bebida saem da câmara para cliente." />
            ) : grouped.length === 0 ? (
              <Empty
                title="Nada com esse nome"
                hint="Tente outro trecho: mini, festa, refrigerante."
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setKind("todos");
                    }}
                  >
                    Limpar busca
                  </Button>
                }
              />
            ) : (
              <CompactList>
                {grouped.map((group) => (
                  <CompactGroup key={group[0].product.id} title={group[0].product.name}>
                    {group.map((item) => {
                      const factory = free?.get(item.niche.id) ?? 0;
                      const chosen = qty[item.niche.id] ?? 0;
                      return (
                        <CompactRow
                          key={item.niche.id}
                          title={item.niche.name}
                          hint={`Câmara tem ${factory} válidas livres`}
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
                  Pedidos deste cliente ({mine?.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {mine?.map((order) => (
                    <Card key={order.id} className="p-4">
                      <p className="font-extrabold">{order.statusLabel}</p>
                      <ul className="mt-1 text-stone-700">
                        {order.items.map((item) => (
                          <li key={item.nicheId}>
                            {item.label} · pediu {item.qty}
                            {item.remaining > 0 ? ` · reserva ${item.availableQty}` : ""}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        )}

        {customer && volume ? (
          <>
            <StickyActionBar>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Recado opcional. Ex.: retira amanhã de manhã"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-orange-500"
              />
              <ErrorBox message={error} />
              <SuccessBox message={ok} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold text-stone-700">
                  {selectedCount > 0 ? `${selectedCount} tipos · ${selectedUnits} un.` : "Nada escolhido ainda"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {last?.length ? (
                    <Button type="button" variant="ghost" onClick={repeatLast}>
                      Repetir o último
                    </Button>
                  ) : null}
                  <Button
                    className="min-w-48"
                    disabled={selectedCount === 0}
                    onClick={() => {
                      setOk("");
                      setConfirm(true);
                    }}
                  >
                    Revisar pedido
                  </Button>
                </div>
              </div>
            </StickyActionBar>

            <ConfirmDialog
              open={confirm}
              title={`Reservar para ${customer.name}?`}
              hint={
                selected.some(([nicheId, value]) => (free?.get(nicheId) ?? 0) < value)
                  ? "A câmara não tem tudo isso agora. O pedido entra na fila, mas pode ficar parcial ou sem estoque."
                  : "O pedido entra na mesma fila das lojas. O estoque ainda não sai da câmara."
              }
              confirmLabel="Confirmar e reservar"
              busy={saving}
              onConfirm={save}
              onCancel={() => setConfirm(false)}
            >
              <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
                {selected.map(([nicheId, value]) => {
                  const found = sellable.find((item) => item.niche.id === nicheId);
                  const factory = free?.get(nicheId) ?? 0;
                  return (
                    <li key={nicheId} className="flex justify-between gap-3 py-3">
                      <span className="font-bold text-stone-800">{found?.label ?? "Produto"}</span>
                      <span className="font-extrabold">
                        {value} un.
                        <span className={`block text-sm font-semibold ${factory < value ? "text-red-700" : "text-stone-500"}`}>
                          livres {factory}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {note ? <p className="mt-3 text-stone-600">Recado: {note}</p> : null}
              <p className="mt-3 text-lg font-extrabold">Total: {selectedUnits} unidades</p>
            </ConfirmDialog>
          </>
        ) : null}
      </AppShell>
    </AccessGate>
  );
}
