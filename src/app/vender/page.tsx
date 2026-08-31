"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { DiscardExpiredBanner } from "@/components/DiscardExpiredBanner";
import { ConfirmDialog, FilterChips, SearchField, StickyActionBar } from "@/components/pick-flow";
import { SessionSalesList } from "@/components/SessionSalesList";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  NumberStepper,
  PageTitle,
  SuccessBox,
  cn,
} from "@/components/ui";
import { isPartyNiche, isSoldAtRegister, saleKindOptions, categoryLabel } from "@/lib/categories";
import { currentCashSession } from "@/lib/cash";
import { cashPeriodLabel } from "@/lib/cash";
import { getPanel } from "@/lib/locations";
import { formatBRL, parseMoney } from "@/lib/money";
import { comboMissingLabel, comboPacksAvailable, listLiveCombos } from "@/lib/combos";
import { expiryAlertsFor, sellableQty, shelfPriceOf, stockByLocation } from "@/lib/queries";
import { quoteFifoQty } from "@/lib/types";
import { getLocationId } from "@/lib/session";
import { checkout, StockError } from "@/lib/stock";
import type { Category, PaymentMethod, SaleChannel } from "@/lib/types";
import { PAYMENT_METHODS, paymentMethodLabel, productIsLive, promoIsLive, promoStatus } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

type Kind = "todos" | Category;

export default function VenderPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const session = useLiveQuery(
    () => (ready && locationId ? currentCashSession(locationId) : undefined),
    [ready, locationId],
  );
  const expiry = useLiveQuery(
    () => (ready && locationId ? expiryAlertsFor(locationId) : []),
    [ready, locationId],
  );
  const expiredHere = (expiry ?? []).filter((item) => item.level === "expired");
  const combos = useLiveQuery(() => (ready ? listLiveCombos() : []), [ready]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [comboCart, setComboCart] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<Record<string, boolean>>({});
  const [channel, setChannel] = useState<SaleChannel>("caixa");
  const [moreSale, setMoreSale] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [split, setSplit] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<PaymentMethod, string>>({
    dinheiro: "",
    pix: "",
    cartao: "",
  });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [quick, setQuick] = useState(false);

  const sellable = useMemo(() => {
    return (stock ?? []).filter(
      (item) =>
        productIsLive(item.product) &&
        item.niche.active &&
        isSoldAtRegister(item.product.category) &&
        !isPartyNiche(item.niche),
    );
  }, [stock]);

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellable.filter((item) => {
      if (kind !== "todos" && item.product.category !== kind) return false;
      if (q && !item.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sellable, search, kind]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([nicheId, cartQty]) => {
          const item = (stock ?? []).find((row) => row.niche.id === nicheId);
          if (!item) return null;
          const usePromo = Boolean(promo[nicheId] && promoIsLive(item.niche));
          const lots = locationId ? item.shelfLots[locationId] ?? [] : [];
          const fallback = locationId ? shelfPriceOf(item, locationId) : item.niche.sellPrice;
          const lineTotal = quoteFifoQty(lots, cartQty, usePromo, item.niche.promoPrice, fallback);
          const unitPrice = cartQty > 0 ? lineTotal / cartQty : fallback;
          return {
            ...item,
            cartQty,
            available: locationId ? sellableQty(item, locationId) : 0,
            usePromo,
            unitPrice,
            lineTotal,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [cart, stock, locationId, promo],
  );

  const sellableByNiche = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of stock ?? []) {
      map[item.niche.id] = locationId ? sellableQty(item, locationId) : 0;
    }
    return map;
  }, [stock, locationId]);

  const comboOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (combos ?? [])
      .filter((combo) => !q || combo.name.toLowerCase().includes(q))
      .map((combo) => ({
        ...combo,
        packsLeft: comboPacksAvailable(combo.items, sellableByNiche),
        missing: comboMissingLabel(combo.items, sellableByNiche),
      }));
  }, [combos, search, sellableByNiche]);

  const comboCartItems = comboOffers
    .filter((combo) => (comboCart[combo.id] ?? 0) > 0)
    .map((combo) => ({ ...combo, cartQty: comboCart[combo.id] ?? 0 }));

  const total =
    cartItems.reduce((sum, item) => sum + item.lineTotal, 0) +
    comboCartItems.reduce((sum, item) => sum + item.cartQty * item.price, 0);
  const paymentLines = split
    ? PAYMENT_METHODS.map((item) => ({ method: item.id, amount: parseMoney(splitAmounts[item.id]) })).filter(
        (row) => Number.isFinite(row.amount) && row.amount > 0,
      )
    : total > 0
      ? [{ method: payment, amount: total }]
      : [];
  const paid = paymentLines.reduce((sum, row) => sum + row.amount, 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const payReady = paymentLines.length > 0 && Math.abs(remaining) < 0.005;

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
        channel: quick ? "caixa" : channel,
        payments: paymentLines,
        items: cartItems.map((item) => ({
          nicheId: item.niche.id,
          qty: item.cartQty,
          promo: quick ? false : item.usePromo,
        })),
        combos: quick ? [] : comboCartItems.map((item) => ({ comboId: item.id, qty: item.cartQty })),
      });
      setCart({});
      setComboCart({});
      setPromo({});
      setSplit(false);
      setSplitAmounts({ dinheiro: "", pix: "", cartao: "" });
      setConfirm(false);
      setQuick(false);
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
      <PageTitle
        title="Vender"
        hint="Só salgado e bebida. Combo baixa os dois. Encomenda de festa fica em Pedir, com data. Sem estoque ou só vencido fica na lista, apagado."
      />

      <DiscardExpiredBanner
        items={expiredHere}
        hint="Lote vencido não entra na venda. Descarte aqui — a venda que você já montou continua."
      />

      {session === undefined ? (
        <Card className="mb-4">
          <p className="font-extrabold text-stone-600">Carregando o caixa...</p>
        </Card>
      ) : session ? (
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

      <div className="pb-40 lg:pb-0">
      <div className="mb-4 space-y-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Coxinha, coca..."
        />
        <FilterChips
          value={kind}
          onChange={setKind}
          options={saleKindOptions()}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {comboOffers.length > 0
            ? comboOffers.map((combo) => {
                const selected = comboCart[combo.id] ?? 0;
                const blocked = combo.packsLeft <= 0;
                return (
                  <button
                    key={combo.id}
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      setComboCart((current) => ({
                        ...current,
                        [combo.id]: Math.min(combo.packsLeft, (current[combo.id] ?? 0) + 1),
                      }))
                    }
                    className={cn(
                      "rounded-3xl p-4 text-left shadow-sm ring-1 ring-orange-200",
                      blocked ? "bg-stone-50" : "bg-orange-50",
                      selected > 0 && "ring-2 ring-orange-500",
                    )}
                  >
                    <p className="text-sm font-extrabold uppercase tracking-wide text-orange-800">Combo</p>
                    <p className="text-xl font-extrabold text-stone-900">{combo.name}</p>
                    <p className="text-stone-600">{combo.items.map((item) => `${item.qty}× ${item.label}`).join(" + ")}</p>
                    <p className="mt-2 text-lg font-extrabold text-orange-700">{formatBRL(combo.price)}</p>
                    <p className={cn("mt-1 text-sm font-semibold", blocked ? "text-stone-700" : "text-stone-500")}>
                      {blocked
                        ? `Falta ${combo.missing ?? "um item"} nesta loja. O combo inteiro fica parado.`
                        : `${combo.packsLeft} combo${combo.packsLeft === 1 ? "" : "s"} neste estoque`}
                      {selected > 0 ? ` · ${selected} no pedido` : ""}
                    </p>
                  </button>
                );
              })
            : null}
          {catalog.length === 0 && comboOffers.length === 0 ? (
            <div className="sm:col-span-2">
              {search.trim() ? (
                <Empty
                  title={`Nada com “${search.trim()}”`}
                  hint={
                    kind === "todos"
                      ? "Limpe a busca ou tente outro nome: coxinha, coca."
                      : `Nada em ${categoryLabel(kind)} com essa busca. Limpe a busca ou volte em Tudo.`
                  }
                  action={
                    <Button type="button" variant="ghost" onClick={() => setSearch("")}>
                      Limpar busca
                    </Button>
                  }
                />
              ) : kind !== "todos" ? (
                <Empty
                  title={`Nada em ${categoryLabel(kind)}`}
                  hint={
                    sellable.length
                      ? "Nesta loja não tem desse tipo para vender. Volte em Tudo para ver o que tem."
                      : "A fábrica precisa mandar estoque para esta loja."
                  }
                  action={
                    sellable.length ? (
                      <Button type="button" variant="ghost" onClick={() => setKind("todos")}>
                        Ver tudo
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Empty
                  title="Nenhum produto para vender"
                  hint="A fábrica precisa mandar estoque para esta loja. Embalagem, limpeza e insumo não aparecem aqui."
                />
              )}
            </div>
          ) : (
            catalog.map((item) => {
              const available = locationId ? sellableQty(item, locationId) : 0;
              const expired = locationId ? (item.expiredQty[locationId] ?? 0) : 0;
              const selected = cart[item.niche.id] ?? 0;
              const blocked = available <= 0;
              return (
                <button
                  key={item.niche.id}
                  type="button"
                  disabled={blocked}
                  onClick={() =>
                    setCart((current) => ({
                      ...current,
                      [item.niche.id]: Math.min(available, (current[item.niche.id] ?? 0) + 1),
                    }))
                  }
                  className={cn(
                    "rounded-3xl p-4 text-left shadow-sm ring-1 ring-stone-200",
                    blocked ? "bg-stone-50" : "bg-white",
                    selected > 0 && "ring-2 ring-orange-500",
                  )}
                >
                  <p className="text-xl font-extrabold text-stone-900">{item.product.name}</p>
                  <p className="text-stone-600">{item.niche.name}</p>
                  <p className="mt-2 text-lg font-extrabold text-orange-700">
                    {formatBRL(locationId ? shelfPriceOf(item, locationId) : item.niche.sellPrice)}
                  </p>
                  {promoIsLive(item.niche) ? (
                    <p className="text-sm font-bold text-emerald-700">
                      Promoção valendo: {formatBRL(item.niche.promoPrice)}
                    </p>
                  ) : promoStatus(item.niche) === "scheduled" ? (
                    <p className="text-sm font-semibold text-stone-500">Promoção ainda não começou</p>
                  ) : null}
                  <p className={cn("mt-1 text-sm font-semibold", blocked ? "text-stone-700" : "text-stone-500")}>
                    {available > 0 ? `${available} para vender` : expired > 0 ? "Só lote vencido — não vende" : "Sem estoque nesta loja"}
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
          {cartItems.length === 0 && comboCartItems.length === 0 ? (
            <p className="text-stone-600">Toque nos produtos ou no combo para montar o pedido.</p>
          ) : (
            <>
              {comboCartItems.map((item) => (
                <div key={item.id} className="space-y-2 border-b border-stone-100 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">Combo · {item.name}</p>
                      <p className="text-sm text-stone-500">{formatBRL(item.price)}</p>
                    </div>
                    <NumberStepper
                      value={item.cartQty}
                      max={item.packsLeft}
                      onChange={(value) => setComboCart((current) => ({ ...current, [item.id]: value }))}
                    />
                  </div>
                </div>
              ))}
              {cartItems.map((item) => (
              <div key={item.niche.id} className="space-y-2 border-b border-stone-100 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{item.label}</p>
                    <p className="text-sm text-stone-500">{formatBRL(item.lineTotal)}</p>
                  </div>
                  <NumberStepper
                    value={item.cartQty}
                    max={item.available}
                    onChange={(value) =>
                      setCart((current) => ({ ...current, [item.niche.id]: value }))
                    }
                  />
                </div>
                {promoIsLive(item.niche) ? (
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
            }
            </>
          )}

          <div>
            <p className="mb-2 font-bold">Como o cliente comprou?</p>
            {moreSale ? (
              <div className="space-y-3 rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200">
                <p className="font-extrabold text-stone-900">No caixa</p>
                <p className="text-sm font-semibold text-stone-600">
                  Delivery ainda não é motoboy — só marca de onde veio a venda nos relatórios.
                </p>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 font-bold text-stone-800">
                  <input
                    type="checkbox"
                    className="size-5 rounded border-stone-300"
                    checked={channel === "delivery"}
                    onChange={(event) => setChannel(event.target.checked ? "delivery" : "caixa")}
                  />
                  Marcar como delivery nesta venda
                </label>
                <Button type="button" variant="ghost" className="min-h-11 text-sm" onClick={() => {
                  setMoreSale(false);
                  setChannel("caixa");
                }}>
                  Voltar ao balcão
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="rounded-2xl bg-orange-50 px-4 py-3 font-extrabold text-orange-900">No caixa</p>
                <Button type="button" variant="ghost" className="w-full min-h-11 text-sm" onClick={() => setMoreSale(true)}>
                  Delivery nesta venda
                </Button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 font-bold">Pagamento</p>
            {split ? (
              <div className="space-y-3">
                {PAYMENT_METHODS.map((item) => (
                  <Field
                    key={item.id}
                    label={item.label}
                    hint={item.id === "dinheiro" ? "Esta parte entra no esperado em espécie." : "Não fica na gaveta."}
                  >
                    <Input
                      inputMode="decimal"
                      value={splitAmounts[item.id]}
                      onChange={(event) =>
                        setSplitAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      placeholder="0,00"
                    />
                  </Field>
                ))}
                <p className={Math.abs(remaining) < 0.005 ? "font-bold text-emerald-800" : "font-bold text-red-700"}>
                  {Math.abs(remaining) < 0.005
                    ? "As formas somam o pedido."
                    : remaining > 0
                      ? `Falta ${formatBRL(remaining)}`
                      : `Passou ${formatBRL(Math.abs(remaining))}`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((item) => (
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
            )}
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full min-h-11 text-sm"
              onClick={() => {
                if (!split) {
                  setSplitAmounts({
                    dinheiro: payment === "dinheiro" && total ? total.toFixed(2).replace(".", ",") : "",
                    pix: payment === "pix" && total ? total.toFixed(2).replace(".", ",") : "",
                    cartao: payment === "cartao" && total ? total.toFixed(2).replace(".", ",") : "",
                  });
                }
                setSplit((current) => !current);
              }}
            >
              {split ? "Uma forma só" : "Dividir pagamento"}
            </Button>
          </div>

          <p className="text-3xl font-extrabold">{formatBRL(total)}</p>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <Button
            className="hidden w-full lg:inline-flex"
            disabled={saving || (cartItems.length === 0 && comboCartItems.length === 0) || !session || !payReady}
            onClick={() => {
              setOk("");
              setQuick(false);
              setConfirm(true);
            }}
          >
            Revisar e fechar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 hidden w-full lg:inline-flex"
            disabled={
              saving ||
              cartItems.length === 0 ||
              comboCartItems.length > 0 ||
              split ||
              !session ||
              !payReady
            }
            onClick={() => {
              setOk("");
              setQuick(true);
              setConfirm(true);
            }}
          >
            Fechar rápido
          </Button>
        </Card>
      </div>

      {session ? (
        <div className="mt-8">
          <SessionSalesList sessionId={session.id} canVoid={!session.closedAt} />
        </div>
      ) : null}
      </div>

      <div className="lg:hidden">
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xl font-extrabold">{formatBRL(total)}</p>
            <div className="flex flex-col gap-2">
              <Button
                className="min-w-44"
                disabled={saving || (cartItems.length === 0 && comboCartItems.length === 0) || !session || !payReady}
                onClick={() => {
                  setOk("");
                  setQuick(false);
                  setConfirm(true);
                }}
              >
                Revisar e fechar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 min-w-44 text-sm"
                disabled={
                  saving ||
                  cartItems.length === 0 ||
                  comboCartItems.length > 0 ||
                  split ||
                  !session ||
                  !payReady
                }
                onClick={() => {
                  setOk("");
                  setQuick(true);
                  setConfirm(true);
                }}
              >
                Fechar rápido
              </Button>
            </div>
          </div>
        </StickyActionBar>
      </div>

      <ConfirmDialog
        open={confirm}
        title={quick ? "Fechar rápido?" : "Fechar esta venda?"}
        hint={
          quick
            ? `No caixa · ${paymentLines.map((row) => `${paymentMethodLabel(row.method)} ${formatBRL(row.amount)}`).join(" + ")}`
            : `${channel === "delivery" ? "Delivery (rótulo)" : "No caixa"} · ${paymentLines.map((row) => `${paymentMethodLabel(row.method)} ${formatBRL(row.amount)}`).join(" + ")}${session ? ` · ${session.employeeName}` : ""}`
        }
        confirmLabel="Confirmar venda"
        busy={saving}
        onConfirm={finish}
        onCancel={() => {
          setConfirm(false);
          setQuick(false);
        }}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {comboCartItems.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-3">
              <span className="font-bold text-stone-800">
                {item.cartQty}× Combo {item.name}
              </span>
              <span className="font-extrabold">{formatBRL(item.cartQty * item.price)}</span>
            </li>
          ))}
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
        {paymentLines.length > 1 ? (
          <ul className="mt-3 space-y-1 font-semibold text-stone-700">
            {paymentLines.map((row) => (
              <li key={row.method}>
                {paymentMethodLabel(row.method)}: {formatBRL(row.amount)}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-2xl font-extrabold">{formatBRL(total)}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
