"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  NumberStepper,
  PageTitle,
  SuccessBox,
  cn,
} from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { formatBRL } from "@/lib/money";
import { stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { checkout, StockError } from "@/lib/stock";
import type { PaymentMethod, SaleChannel } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

const channels: { id: SaleChannel; label: string }[] = [
  { id: "caixa", label: "No caixa" },
  { id: "delivery", label: "Delivery" },
  { id: "encomenda", label: "Encomenda" },
];

const payments: { id: PaymentMethod; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "cartao", label: "Cartão" },
];

export default function VenderPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"todos" | "salgado" | "bebida">("todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [channel, setChannel] = useState<SaleChannel>("caixa");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock ?? []).filter((item) => {
      if (!item.niche.active) return false;
      if (kind !== "todos" && item.product.category !== kind) return false;
      if (q && !item.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stock, search, kind]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([nicheId, cartQty]) => {
          const item = (stock ?? []).find((row) => row.niche.id === nicheId);
          return item
            ? { ...item, cartQty, available: item.qty[locationId ?? ""] ?? 0 }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [cart, stock, locationId],
  );

  const total = cartItems.reduce((sum, item) => sum + item.cartQty * item.niche.sellPrice, 0);

  if (panel && panel.type !== "store") {
    return (
      <AppShell>
        <Empty
          title="A venda é na loja"
          hint="Abra o painel da Loja 1 ou da Loja 2 para usar o caixa."
        />
      </AppShell>
    );
  }

  async function finish() {
    if (!locationId) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await checkout({
        locationId,
        channel,
        payment,
        items: cartItems.map((item) => ({ nicheId: item.niche.id, qty: item.cartQty })),
      });
      setCart({});
      setConfirm(false);
      setOk(`Venda feita. ${formatBRL(total)}`);
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para vender. Veja se tem estoque.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageTitle title="Vender" hint="Toque no produto, escolha a quantidade e feche a venda." />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_20rem]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Procurar produto..."
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-lg outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
        />
        <div className="grid grid-cols-3 gap-2">
          {(["todos", "salgado", "bebida"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={kind === value ? "primary" : "ghost"}
              className="min-h-12 text-base"
              onClick={() => setKind(value)}
            >
              {value === "todos" ? "Tudo" : value === "salgado" ? "Salgado" : "Bebida"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.length === 0 ? (
            <div className="sm:col-span-2">
              <Empty
                title="Nenhum produto para vender"
                hint="Cadastre os produtos e mande estoque da fábrica para esta loja."
              />
            </div>
          ) : (
            catalog.map((item) => {
              const available = item.qty[locationId ?? ""] ?? 0;
              const selected = cart[item.niche.id] ?? 0;
              return (
                <button
                  key={item.niche.id}
                  type="button"
                  disabled={available <= 0}
                  onClick={() =>
                    setCart((current) => ({
                      ...current,
                      [item.niche.id]: Math.min(available, (current[item.niche.id] ?? 0) + 1),
                    }))
                  }
                  className={cn(
                    "rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200 disabled:opacity-50",
                    selected > 0 && "ring-2 ring-orange-500",
                  )}
                >
                  <p className="text-xl font-extrabold text-stone-900">{item.product.name}</p>
                  <p className="text-stone-600">{item.niche.name}</p>
                  <p className="mt-2 text-lg font-extrabold text-orange-700">
                    {formatBRL(item.niche.sellPrice)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-stone-500">
                    {available > 0 ? `${available} no estoque` : "Sem estoque"}
                    {selected > 0 ? ` · ${selected} no pedido` : ""}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <Card className="h-fit space-y-4 lg:sticky lg:top-28">
          <h2 className="text-2xl font-extrabold">Pedido</h2>
          {cartItems.length === 0 ? (
            <p className="text-stone-600">Toque nos produtos para montar o pedido.</p>
          ) : (
            cartItems.map((item) => (
              <div key={item.niche.id} className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{item.label}</p>
                  <p className="text-sm text-stone-500">{formatBRL(item.niche.sellPrice)}</p>
                </div>
                <NumberStepper
                  value={item.cartQty}
                  max={item.available}
                  onChange={(value) =>
                    setCart((current) => ({ ...current, [item.niche.id]: value }))
                  }
                />
              </div>
            ))
          )}

          <div>
            <p className="mb-2 font-bold">Como o cliente comprou?</p>
            <div className="grid grid-cols-3 gap-2">
              {channels.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={channel === item.id ? "primary" : "ghost"}
                  className="min-h-12 px-2 text-sm"
                  onClick={() => setChannel(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 font-bold">Pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {payments.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={payment === item.id ? "secondary" : "ghost"}
                  className="min-h-12 px-2 text-sm"
                  onClick={() => setPayment(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-3xl font-extrabold">{formatBRL(total)}</p>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <Button className="w-full" disabled={saving || cartItems.length === 0} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e fechar
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Fechar esta venda?"
        hint={`${channels.find((item) => item.id === channel)?.label} · ${payments.find((item) => item.id === payment)?.label}`}
        confirmLabel="Confirmar venda"
        busy={saving}
        onConfirm={finish}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {cartItems.map((item) => (
            <li key={item.niche.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">
                {item.cartQty}× {item.label}
              </span>
              <span className="font-extrabold">{formatBRL(item.cartQty * item.niche.sellPrice)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xl font-extrabold">{formatBRL(total)}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
