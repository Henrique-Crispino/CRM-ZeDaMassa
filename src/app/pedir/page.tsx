"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Pager, usePager } from "@/components/pager";
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
} from "@/components/ui";
import { currentCashSession } from "@/lib/cash";
import { deliverEncomenda, EncomendaError, estimateEncomendaTotal, isOpenPartyRequest, takeEncomendaSignal } from "@/lib/encomendas";
import { getPanel } from "@/lib/locations";
import { formatBRL, formatDate, parseMoney, todayDate } from "@/lib/money";
import { catalogItems, stockByLocation } from "@/lib/queries";
import { createStoreRequest, listRequests, RequestError, type RequestView } from "@/lib/requests";
import { getLocationId } from "@/lib/session";
import type { PaymentMethod, StoreRequestKind } from "@/lib/types";
import { PAYMENT_METHODS, paymentMethodLabel, storeRequestKind, storeRequestKindLabel } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function PedirPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const catalog = useLiveQuery(() => (ready ? catalogItems() : []), [ready]);
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const session = useLiveQuery(
    () => (ready && locationId ? currentCashSession(locationId) : undefined),
    [ready, locationId],
  );
  const mine = useLiveQuery(
    () => (ready && locationId ? listRequests().then((rows) => rows.filter((row) => row.fromLocationId === locationId)) : []),
    [ready, locationId],
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PickKind>("todos");
  const [askKind, setAskKind] = useState<StoreRequestKind>("reposicao");
  const [neededBy, setNeededBy] = useState("");
  const [guestName, setGuestName] = useState("");
  const [totalText, setTotalText] = useState("");
  const [signalMode, setSignalMode] = useState<"50" | "25" | "valor" | "depois">("depois");
  const [signalText, setSignalText] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState<{ action: "sinal" | "entregar"; request: RequestView } | null>(null);
  const [payLater, setPayLater] = useState<PaymentMethod>("pix");

  const selected = useMemo(
    () => Object.entries(qty).filter(([, value]) => value > 0),
    [qty],
  );
  const selectedCount = selected.length;
  const selectedUnits = selected.reduce((sum, [, value]) => sum + value, 0);

  const shelfTotal = useMemo(() => {
    return selected.reduce((sum, [nicheId, value]) => {
      const found = catalog?.find((item) => item.niche.id === nicheId);
      return sum + (found?.niche.sellPrice ?? 0) * value;
    }, 0);
  }, [catalog, selected]);

  useEffect(() => {
    if (askKind !== "encomenda") return;
    setTotalText(shelfTotal > 0 ? shelfTotal.toFixed(2).replace(".", ",") : "");
  }, [askKind, shelfTotal]);

  const estimatedTotal = parseMoney(totalText || String(shelfTotal));
  const signalAmount =
    signalMode === "depois"
      ? 0
      : signalMode === "50"
        ? Math.round(estimatedTotal * 50) / 100
        : signalMode === "25"
          ? Math.round(estimatedTotal * 25) / 100
          : parseMoney(signalText);

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
  const mineRows = mine ?? [];
  const openMine = mineRows.filter(isOpenPartyRequest);
  const otherMine = mineRows.filter((row) => !isOpenPartyRequest(row));
  const openPage = usePager(openMine, 4, String(openMine.length));
  const minePage = usePager(otherMine, 8, String(otherMine.length));

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
        kind: askKind,
        neededBy: askKind === "encomenda" ? neededBy : undefined,
        guestName: askKind === "encomenda" ? guestName : undefined,
        estimatedTotal: askKind === "encomenda" ? estimatedTotal : undefined,
        items: selected.map(([nicheId, value]) => ({ nicheId, qty: value })),
        signal:
          askKind === "encomenda" && signalMode !== "depois" && signalAmount > 0
            ? { amount: signalAmount, payment }
            : undefined,
      });
      setQty({});
      setNote("");
      setSearch("");
      setKind("todos");
      setGuestName("");
      setTotalText("");
      setSignalMode("depois");
      setSignalText("");
      setConfirm(false);
      setOk(
        askKind === "encomenda"
          ? "Encomenda enviada. A fábrica já foi avisada com a data."
          : "Pedido enviado. A fábrica e o admin já foram avisados.",
      );
    } catch (err) {
      setConfirm(false);
      setError(
        err instanceof RequestError || err instanceof EncomendaError
          ? err.message
          : "Não deu para enviar o pedido.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function finishPending() {
    if (!pending) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      if (pending.action === "sinal") {
        const total = pending.request.estimatedTotal ?? (await estimateEncomendaTotal(pending.request.items));
        await takeEncomendaSignal({
          requestId: pending.request.id,
          amount: Math.round(total * 50) / 100,
          payment: payLater,
        });
        setOk("Sinal entrou no caixa. Estoque da loja não mexeu.");
      } else {
        await deliverEncomenda({ requestId: pending.request.id, payment: payLater });
        setOk("Resto entrou no caixa. A festa saiu da prateleira desta loja.");
      }
      setPending(null);
    } catch (err) {
      setPending(null);
      setError(err instanceof EncomendaError ? err.message : "Não deu para lançar o dinheiro.");
    } finally {
      setSaving(false);
    }
  }

  const canSend =
    selectedCount > 0 &&
    (askKind === "reposicao" ||
      (Boolean(neededBy) &&
        estimatedTotal > 0 &&
        (signalMode === "depois" || (signalAmount > 0 && signalAmount < estimatedTotal && Boolean(session)))));

  function requestCard(request: RequestView) {
    const kindLabel = storeRequestKindLabel(storeRequestKind(request));
    const canSignal =
      storeRequestKind(request) === "encomenda" &&
      !request.signalSaleId &&
      !request.deliveredAt &&
      Boolean(session);
    const canDeliver =
      storeRequestKind(request) === "encomenda" &&
      Boolean(request.signalSaleId) &&
      request.status === "sent" &&
      !request.deliveredAt &&
      Boolean(session);
    return (
      <Card key={request.id} className="p-4">
        <p className="font-extrabold">
          {kindLabel} · {request.statusLabel}
          {request.neededBy ? ` · ${formatDate(request.neededBy)}` : ""}
        </p>
        {request.guestName ? <p className="text-stone-600">{request.guestName}</p> : null}
        {request.signalAmount ? (
          <p className="text-sm font-semibold text-emerald-800">
            Sinal {formatBRL(request.signalAmount)}
            {request.estimatedTotal ? ` · faltam ${formatBRL(request.estimatedTotal - request.signalAmount)}` : ""}
          </p>
        ) : null}
        {request.deliveredAt ? <p className="text-sm font-semibold text-stone-500">Entregue</p> : null}
        <ul className="mt-1 text-stone-700">
          {request.items.map((item) => (
            <li key={item.nicheId}>
              {item.label} · pediu {item.qty}
              {item.sentQty > 0 ? ` · mandou ${item.sentQty}` : ""}
            </li>
          ))}
        </ul>
        {canSignal || canDeliver ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {canSignal ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  setOk("");
                  setPending({ action: "sinal", request });
                }}
              >
                Receber sinal 50%
              </Button>
            ) : null}
            {canDeliver ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  setOk("");
                  setPending({ action: "entregar", request });
                }}
              >
                Resto e entregar
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="pb-44">
        <PageTitle
          title="Pedir para a fábrica"
          hint="Peça o que esta loja precisa. A fábrica recebe o aviso. Se a câmara não aguentar, o pedido fica do lado dela."
        />

        {openMine.length > 0 ? (
          <section className="mb-6">
            <h2 className="text-xl font-extrabold text-stone-900">Festas em aberto</h2>
            <p className="mt-1 mb-3 text-stone-600">
              Sinal já entrou. O resto se recebe aqui, no dia, com o caixa aberto.
            </p>
            <div ref={openPage.listRef} className="space-y-3">
              {openPage.rows.map(requestCard)}
            </div>
            <Pager
              page={openPage.page}
              pages={openPage.pages}
              total={openPage.total}
              onPage={openPage.setPage}
              word="festas"
            />
          </section>
        ) : null}

        <div className="mb-4 space-y-3">
          <FilterChips
            value={askKind}
            onChange={setAskKind}
            options={[
              { id: "reposicao", label: "Reposição" },
              { id: "encomenda", label: "Encomenda" },
            ]}
          />
          <SearchField value={search} onChange={setSearch} placeholder="Buscar: coxinha, festa, coca..." />
          <FilterChips value={kind} onChange={setKind} options={pickKindOptions(selectedCount)} />
        </div>

        {askKind === "encomenda" ? (
          <Card className="mb-4 space-y-3">
            <Field label="Dia da festa" hint="A fábrica vê esta data no pedido.">
              <Input type="date" min={todayDate()} value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
            </Field>
            <Field label="Nome (opcional)">
              <Input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Ex.: aniversário da Márcia" />
            </Field>
            <Field label="Valor da festa" hint="Estimativa pelo preço de prateleira. Pode corrigir.">
              <Input inputMode="decimal" value={totalText} onChange={(event) => setTotalText(event.target.value)} placeholder="0,00" />
            </Field>
            <div>
              <p className="mb-2 font-bold">Sinal</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["50", "50%"],
                    ["25", "25%"],
                    ["valor", "Valor"],
                    ["depois", "Depois"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    variant={signalMode === id ? "primary" : "ghost"}
                    className="min-h-11"
                    onClick={() => setSignalMode(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {signalMode === "valor" ? (
                <Field label="Quanto entra agora" hint="Tem que ser menos que o total.">
                  <Input inputMode="decimal" value={signalText} onChange={(event) => setSignalText(event.target.value)} placeholder="0,00" />
                </Field>
              ) : null}
              {signalMode !== "depois" ? (
                <p className="mt-2 font-semibold text-stone-700">
                  Sinal {formatBRL(signalAmount || 0)}
                  {estimatedTotal > signalAmount ? ` · faltam ${formatBRL(estimatedTotal - signalAmount)} no dia` : ""}
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-stone-500">O pedido vai mesmo sem o sinal. Receba depois, com o caixa aberto.</p>
              )}
              {signalMode !== "depois" ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant={payment === item.id ? "secondary" : "ghost"}
                      className="min-h-11 px-2 text-sm"
                      onClick={() => setPayment(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {signalMode !== "depois" && !session ? (
                <p className="mt-2 font-bold text-red-700">Abra o caixa para receber o sinal agora.</p>
              ) : null}
            </div>
          </Card>
        ) : null}

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
                  const chosen = qty[item.niche.id] ?? 0;
                  return (
                    <CompactRow
                      key={item.niche.id}
                      title={item.niche.name}
                      hint={`Nesta loja: ${here}`}
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

        {otherMine.length > 0 ? (
          <details className="mt-8 rounded-3xl bg-white p-4 ring-1 ring-stone-200">
            <summary className="cursor-pointer text-lg font-extrabold text-stone-900">
              Pedidos já feitos ({otherMine.length})
            </summary>
            <div ref={minePage.listRef} className="mt-3 scroll-mt-36 space-y-3">
              {minePage.rows.map(requestCard)}
              <Pager
                page={minePage.page}
                pages={minePage.pages}
                total={minePage.total}
                onPage={minePage.setPage}
                word="pedidos"
              />
            </div>
          </details>
        ) : null}
      </div>

      <StickyActionBar>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={askKind === "encomenda" ? "Recado opcional. Ex.: entregar de manhã" : "Recado opcional. Ex.: festa no sábado"}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-orange-500"
        />
        <ErrorBox message={error} />
        <SuccessBox message={ok} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {selectedCount > 0 ? `${selectedCount} tipos · ${selectedUnits} un.` : "Nada escolhido ainda"}
          </p>
          <Button className="min-w-48" disabled={!canSend} onClick={() => { setOk(""); setConfirm(true); }}>
            Revisar e enviar
          </Button>
        </div>
      </StickyActionBar>

      <ConfirmDialog
        open={confirm}
        title={askKind === "encomenda" ? "Enviar esta encomenda?" : "Enviar este pedido?"}
        hint={
          askKind === "encomenda"
            ? "A fábrica vê a data hoje. O estoque desta loja não sai agora."
            : "A fábrica e o admin vão receber o aviso. Se a câmara não aguentar, o pedido fica."
        }
        confirmLabel="Confirmar pedido"
        busy={saving}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      >
        <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
          {selected.map(([nicheId, value]) => {
            const found = catalog?.find((item) => item.niche.id === nicheId);
            return (
              <li key={nicheId} className="flex justify-between gap-3 py-3">
                <span className="font-bold text-stone-800">{found?.label ?? "Produto"}</span>
                <span className="font-extrabold">{value} un.</span>
              </li>
            );
          })}
        </ul>
        {askKind === "encomenda" && neededBy ? (
          <p className="mt-3 font-semibold text-stone-700">Para {formatDate(neededBy)}</p>
        ) : null}
        {askKind === "encomenda" && signalMode !== "depois" ? (
          <p className="mt-1 font-semibold text-stone-700">
            Sinal {formatBRL(signalAmount)} · {paymentMethodLabel(payment)}
          </p>
        ) : null}
        {note ? <p className="mt-3 text-stone-600">Recado: {note}</p> : null}
        <p className="mt-3 text-lg font-extrabold">Total: {selectedUnits} unidades</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === "sinal" ? "Receber o sinal agora?" : "Receber o resto e entregar?"}
        hint={
          pending?.action === "sinal"
            ? "Entra no caixa deste turno. Estoque não sai."
            : "Só se o envio já foi conferido. A baixa é da prateleira desta loja."
        }
        confirmLabel={pending?.action === "sinal" ? "Confirmar sinal" : "Confirmar entrega"}
        busy={saving}
        onConfirm={finishPending}
        onCancel={() => setPending(null)}
      >
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={payLater === item.id ? "secondary" : "ghost"}
              className="min-h-11 px-2 text-sm"
              onClick={() => setPayLater(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </ConfirmDialog>
    </AppShell>
  );
}
