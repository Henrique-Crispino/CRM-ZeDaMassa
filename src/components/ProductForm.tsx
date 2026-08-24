"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, defaultPerishable, defaultShelfLife } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/money";
import type { Category, Niche, Product } from "@/lib/types";
import { BackLink } from "./BackLink";
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
            {perishable ? "Perecível: controla vencimento" : "Não perecível"}
          </Button>
          {perishable ? (
            <Field label="Validade depois de feito" hint="Quantos dias o lote pode ser usado.">
              <NumberStepper value={shelfLifeDays} min={1} max={365} onChange={setShelfLifeDays} />
            </Field>
          ) : null}
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
