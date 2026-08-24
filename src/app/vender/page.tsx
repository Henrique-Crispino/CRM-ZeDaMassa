"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog, FilterChips, SearchField } from "@/components/pick-flow";
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
import { CATEGORIES } from "@/lib/categories";
import { currentCashSession } from "@/lib/cash";
import { cashPeriodLabel } from "@/lib/cash";
import { getPanel } from "@/lib/locations";
import { formatBRL } from "@/lib/money";
import { expiryAlertsFor, sellableQty, stockByLocation } from "@/lib/queries";
import { getLocationId } from "@/lib/session";
import { checkout, StockError } from "@/lib/stock";
import type { Category, PaymentMethod, SaleChannel } from "@/lib/types";
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

type Kind = "todos" | Category;

export default function VenderPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const session = useLiveQuery(
    () => (ready && locationId ? currentCashSession(locationId) : null),
    [ready, locationId],
  );
  const expiry = useLiveQuery(
    () => (ready && locationId ? expiryAlertsFor(locationId) : []),
    [ready, locationId],
  );
  const expiredHere = (expiry ?? []).filter((item) => item.level === "expired");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<Record<string, boolean>>({});
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
          if (!item) return null;
          const usePromo = Boolean(promo[nicheId] && item.niche.promoAllowed && item.niche.promoPrice > 0);
          const unitPrice = usePromo ? item.niche.promoPrice : item.niche.sellPrice;
          return {
            ...item,
            cartQty,
            available: locationId ? sellableQty(item, locationId) : 0,
            usePromo,
            unitPrice,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [cart, stock, locationId, promo],
  );

  const total = cartItems.reduce((sum, item) => sum + item.cartQty * item.unitPrice, 0);

  if (panel && panel.type !== "store") {
    return (
      <AppShell>
        <Empty
          title="A venda é na loja"
          hint="Abra o painel de uma loja para usar o caixa."
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
        items: cartItems.map((item) => ({
          nicheId: item.niche.id,
          qty: item.cartQty,
          promo: item.usePromo,
        })),
      });
      setCart({});
      setPromo({});
      setConfirm(false);
      setOk(`Venda feita. ${formatBRL(total)}`);
    } catch (err) {
      setConfirm(false);
      setError(err instanceof StockError ? err.message : "Não deu para vender. Veja se tem estoque e caixa aberto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageTitle title="Vender" hint="Toque no produto, escolha a quantidade e feche a venda." />

      {expiredHere.length > 0 ? (
        <Card className="mb-4 bg-red-50 ring-red-200">
          <p className="font-extrabold text-red-800">
            {expiredHere.reduce((sum, item) => sum + item.qty, 0)} un. vencidas nesta loja
          </p>
          <p className="mt-1 text-stone-700">
            Lote vencido não entra na venda. Descarte no estoque para baixar a quantidade.
          </p>
          <Link
            href="/estoque"
            className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-red-600 px-4 font-bold text-white"
          >
            Descartar vencidos
          </Link>
        </Card>
      ) : null}

      {session ? (
        <Card className="mb-4 bg-emerald-50 ring-emerald-200">
          <p className="font-extrabold text-emerald-900">
            Caixa aberto · {cashPeriodLabel(session.period)} · {session.employeeName}
          </p>
          <p className="text-sm font-semibold text-emerald-800">As vendas deste período ficam no nome desta pessoa.</p>
        </Card>
      ) : (
        <Card className="mb-4 bg-red-50 ring-red-200">
          <p className="font-extrabold text-red-800">O caixa desta loja está fechado.</p>
          <p className="mt-1 text-stone-700">Abra o período da manhã ou da tarde antes de vender.</p>
          <Link
            href="/caixa"
            className="mt-3 inline-flex min-h-12 items-center rounded-2xl bg-red-600 px-4 font-bold text-white"
          >
            Abrir caixa
          </Link>
        </Card>
      )}

      <div className="mb-4 space-y-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Procurar produto..."
        />
        <FilterChips
          value={kind}
          onChange={setKind}
          options={[{ id: "todos", label: "Tudo" }, ...CATEGORIES]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.length === 0 ? (
            <div className="sm:col-span-2">
              <Empty
                title="Nenhum produto para vender"
                hint="A fábrica precisa mandar estoque para esta loja."
              />
            </div>
          ) : (
            catalog.map((item) => {
              const available = locationId ? sellableQty(item, locationId) : 0;
              const expired = locationId ? (item.expiredQty[locationId] ?? 0) : 0;
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
                  {item.niche.promoAllowed && item.niche.promoPrice > 0 ? (
                    <p className="text-sm font-bold text-emerald-700">
                      Promoção liberada: {formatBRL(item.niche.promoPrice)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-stone-500">
                    {available > 0 ? `${available} para vender` : expired > 0 ? "Só lote vencido" : "Sem estoque"}
                    {expired > 0 && available > 0 ? ` · ${expired} vencidas` : ""}
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
              <div key={item.niche.id} className="space-y-2 border-b border-stone-100 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{item.label}</p>
                    <p className="text-sm text-stone-500">{formatBRL(item.unitPrice)}</p>
                  </div>
                  <NumberStepper
                    value={item.cartQty}
                    max={item.available}
                    onChange={(value) =>
                      setCart((current) => ({ ...current, [item.niche.id]: value }))
                    }
                  />
                </div>
                {item.niche.promoAllowed && item.niche.promoPrice > 0 ? (
                  <Button
                    type="button"
                    variant={item.usePromo ? "primary" : "ghost"}
                    className="min-h-11 w-full text-sm"
                    onClick={() =>
                      setPromo((current) => ({ ...current, [item.niche.id]: !current[item.niche.id] }))
                    }
                  >
                    {item.usePromo
                      ? `Promoção ligada · ${formatBRL(item.niche.promoPrice)}`
                      : `Vender em promoção · ${formatBRL(item.niche.promoPrice)}`}
                  </Button>
                ) : null}
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
          <Button
            className="w-full"
            disabled={saving || cartItems.length === 0 || !session}
            onClick={() => {
              setOk("");
              setConfirm(true);
            }}
          >
            Revisar e fechar
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Fechar esta venda?"
        hint={`${channels.find((item) => item.id === channel)?.label} · ${payments.find((item) => item.id === payment)?.label}${session ? ` · ${session.employeeName}` : ""}`}
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
                {item.usePromo ? " · promoção" : ""}
              </span>
              <span className="font-extrabold">{formatBRL(item.cartQty * item.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xl font-extrabold">{formatBRL(total)}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
