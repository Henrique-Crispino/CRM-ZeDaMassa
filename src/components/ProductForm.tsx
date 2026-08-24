"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CATEGORIES, defaultPerishable, defaultShelfLife, isPurchased } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/money";
import { productStockQty, stockByLocation } from "@/lib/queries";
import { productIsLive, type Category, type Niche, type Product } from "@/lib/types";
import { BackLink } from "./BackLink";
import { ProductCloseControls } from "./ProductCloseControls";
import { Button, Card, ErrorBox, Field, Input, NumberStepper } from "./ui";

type NicheDraft = {
  id?: string;
  name: string;
  sellPrice: string;
  costPrice: string;
  minStockFactory: number;
  minStockStore: number;
  active: boolean;
};

function emptyNiche(): NicheDraft {
  return { name: "", sellPrice: "", costPrice: "", minStockFactory: 100, minStockStore: 20, active: true };
}

export function ProductForm({
  product,
  niches = [],
}: {
  product?: Product;
  niches?: Niche[];
}) {
  const router = useRouter();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<Category>(product?.category ?? "salgado");
  const [perishable, setPerishable] = useState(product?.perishable ?? defaultPerishable(product?.category ?? "salgado"));
  const [shelfLifeDays, setShelfLifeDays] = useState(product?.shelfLifeDays ?? defaultShelfLife(product?.category ?? "salgado"));
  const [types, setTypes] = useState<NicheDraft[]>(
    niches.length
      ? niches.map((niche) => ({
          id: niche.id,
          name: niche.name,
          sellPrice: String(niche.sellPrice).replace(".", ","),
          costPrice: String(niche.costPrice).replace(".", ","),
          minStockFactory: niche.minStockFactory ?? Math.max(100, (niche.minStock ?? 20) * 5),
          minStockStore: niche.minStockStore ?? niche.minStock ?? 20,
          active: niche.active,
        }))
      : [emptyNiche()],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const stock = useLiveQuery(() => (product ? stockByLocation() : []), [product?.id]);
  const closed = Boolean(product && !productIsLive(product));
  const leftover = product ? productStockQty(stock ?? [], product.id) : 0;

  function updateType(index: number, patch: Partial<NicheDraft>) {
    setTypes((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    setError("");
    const productName = name.trim();
    if (!productName) {
      setError("Escreva o nome do produto. Exemplo: Coxinha.");
      return;
    }

    const validTypes = types.filter((item) => item.name.trim());
    if (validTypes.length === 0) {
      setError("Coloque pelo menos um tipo. Exemplo: Mini, Festa ou Assado.");
      return;
    }

    const parsed = validTypes.map((item) => ({
      ...item,
      name: item.name.trim(),
      sell: Number(item.sellPrice.replace(",", ".")),
      cost: Number(item.costPrice.replace(",", ".")),
    }));

    if (parsed.some((item) => !Number.isFinite(item.sell) || item.sell <= 0)) {
      setError("Todo tipo precisa ter o preço de venda. Exemplo: 1,50");
      return;
    }

    if (perishable && shelfLifeDays < 1) {
      setError("Produto perecível precisa dos dias de validade.");
      return;
    }

    setSaving(true);
    try {
      const db = getDb();
      const productId = product?.id ?? newId();
      const now = new Date().toISOString();

      await db.transaction("rw", [db.products, db.niches], async () => {
        await db.products.put({
          id: productId,
          name: productName,
          category,
          perishable,
          shelfLifeDays: perishable ? Math.max(1, shelfLifeDays) : 0,
          createdAt: product?.createdAt ?? now,
          active: product ? productIsLive(product) : true,
        });

        for (const item of parsed) {
          const current = item.id ? await db.niches.get(item.id) : undefined;
          await db.niches.put({
            id: item.id ?? newId(),
            productId,
            name: item.name,
            sellPrice: item.sell,
            costPrice: Number.isFinite(item.cost) ? item.cost : 0,
            minStock: item.minStockStore,
            minStockFactory: item.minStockFactory,
            minStockStore: item.minStockStore,
            active: item.active,
            promoAllowed: current?.promoAllowed ?? false,
            promoPrice: current?.promoPrice ?? 0,
          });
        }
      });

      router.push("/produtos");
      router.refresh();
    } catch {
      setError("Não deu para salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {product ? (
        <Card className="space-y-3">
          {closed ? (
            <div>
              <p className="text-lg font-extrabold text-stone-900">Este produto está fechado</p>
              <p className="mt-1 text-base text-stone-600">
                Não aparece na venda, na produção, no pedido nem no envio. Histórico e estoque
                continuam. O que ainda tem sai no inventário ou no descarte.
              </p>
            </div>
          ) : (
            <p className="text-base text-stone-600">
              Fechar some do catálogo vivo. Não apaga lote, venda nem extrato.
            </p>
          )}
          <ProductCloseControls product={product} stockQty={leftover} />
        </Card>
      ) : null}

      <Card className="space-y-5">
        <Field label="Nome do produto" hint="O nome que todo mundo já conhece.">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Coxinha, Risole, Coca-Cola"
          />
        </Field>

        <div>
          <p className="mb-2 text-base font-bold text-stone-800">O que é?</p>
          <p className="mb-3 text-sm font-semibold text-stone-500">
            Salgado é produção. O resto entra em Compras. Insumo (farinha, óleo, recheio) fica na
            fábrica e não aparece no caixa da loja. Bebida pode ter validade — ligue o vencimento se
            o rótulo tiver data.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CATEGORIES.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={category === item.id ? "primary" : "ghost"}
                onClick={() => {
                  setCategory(item.id);
                  if (!product) {
                    setPerishable(defaultPerishable(item.id));
                    setShelfLifeDays(defaultShelfLife(item.id));
                  }
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Button
            type="button"
            variant={perishable ? "primary" : "ghost"}
            onClick={() => {
              const next = !perishable;
              setPerishable(next);
              if (next && shelfLifeDays <= 0) setShelfLifeDays(defaultShelfLife(category) || 2);
            }}
          >
            {perishable ? "Perecível: controla vencimento" : "Não perecível — sem data de validade"}
          </Button>
          {perishable ? (
            <Field
              label={isPurchased(category) ? "Validade depois da entrada" : "Validade depois de feito"}
              hint={
                isPurchased(category)
                  ? "Quantos dias o lote vale depois que chega. Na compra dá para pôr a data do rótulo."
                  : "Quantos dias o lote pode ser usado."
              }
            >
              <NumberStepper value={shelfLifeDays} min={1} max={730} onChange={setShelfLifeDays} />
            </Field>
          ) : (
            <p className="text-sm font-semibold leading-relaxed text-stone-500">
              {category === "bebida"
                ? "Refrigerante que não vence fica assim. Se vence, ligue o controle e coloque os dias."
                : category === "insumo"
                  ? "Farinha e óleo entram pela compra. Sem validade no lote, a menos que vocês liguem o vencimento."
                  : "Sem validade no lote."}
            </p>
          )}
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-2xl font-extrabold text-stone-900">Tipos desse produto</h2>
        <p className="mb-4 text-lg text-stone-600">
          O mesmo salgado pode ser Mini, Festa, Assado, para comer na hora... Cada tipo tem o seu
          preço.
        </p>
        <div className="space-y-4">
          {types.map((item, index) => (
            <Card key={item.id ?? `new-${index}`} className="space-y-4">
              <Field label={`Tipo ${index + 1}`} hint="Ex.: Mini, Festa, Assado, Consumo local">
                <Input
                  value={item.name}
                  onChange={(event) => updateType(index, { name: event.target.value })}
                  placeholder="Mini"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Preço de venda" hint="Quanto o cliente paga.">
                  <Input
                    inputMode="decimal"
                    value={item.sellPrice}
                    onChange={(event) => updateType(index, { sellPrice: event.target.value })}
                    placeholder="1,50"
                  />
                </Field>
                <Field label="Custo" hint="Quanto custa para fazer. Vale para o próximo lote. O que já foi feito fica com o custo antigo.">
                  <Input
                    inputMode="decimal"
                    value={item.costPrice}
                    onChange={(event) => updateType(index, { costPrice: event.target.value })}
                    placeholder="0,40"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Mínimo na fábrica"
                  hint="Precisa ser maior: a fábrica abastece as duas lojas."
                >
                  <NumberStepper
                    value={item.minStockFactory}
                    onChange={(value) => updateType(index, { minStockFactory: value })}
                    max={9999}
                  />
                </Field>
                <Field
                  label="Mínimo na loja"
                  hint="Quando a loja chegar nisso, o painel avisa para mandar mais."
                >
                  <NumberStepper
                    value={item.minStockStore}
                    onChange={(value) => updateType(index, { minStockStore: value })}
                    max={9999}
                  />
                </Field>
              </div>
              {item.id ? (
                <Button
                  type="button"
                  variant={item.active ? "ghost" : "soft"}
                  onClick={() => updateType(index, { active: !item.active })}
                >
                  {item.active ? "Esconder este tipo nas vendas" : "Voltar a mostrar este tipo"}
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
        <Button type="button" variant="soft" className="mt-4" onClick={() => setTypes((c) => [...c, emptyNiche()])}>
          + Adicionar outro tipo
        </Button>
      </div>

      <ErrorBox message={error} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button className="w-full sm:w-auto" disabled={saving} onClick={save}>
          {saving ? "Salvando..." : "Salvar produto"}
        </Button>
        <BackLink href="/produtos" label="Voltar sem salvar" className="w-full justify-center sm:w-auto" />
      </div>
    </div>
  );
}
