"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { ProductCloseControls } from "@/components/ProductCloseControls";
import { SearchField } from "@/components/pick-flow";
import { Card, Empty, PageTitle } from "@/components/ui";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { categoryLabel } from "@/lib/categories";
import { getDb } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { productStockQty, stockByLocation } from "@/lib/queries";
import { productIsLive } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function ProdutosPage() {
  const ready = useReady();
  const products = useLiveQuery(() => (ready ? getDb().products.orderBy("name").toArray() : []), [ready]);
  const niches = useLiveQuery(() => (ready ? getDb().niches.toArray() : []), [ready]);
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((product) => {
        if (!q) return true;
        const types = (niches ?? []).filter((niche) => niche.productId === product.id);
        return (
          product.name.toLowerCase().includes(q) ||
          types.some((niche) => niche.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const live = Number(productIsLive(b)) - Number(productIsLive(a));
        return live || a.name.localeCompare(b.name, "pt-BR");
      });
  }, [niches, products, search]);

  const list = usePager(visible, 8, search);

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Cadastro de produto é da administração e da fábrica"
      hint="A loja só vende e pede reposição. Quem cadastra produto é a administração ou a fábrica."
    >
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          title="Produtos"
          hint="Cadastre salgados, bebidas, limpeza, descartáveis e embalagens. Cada um pode ter vários tipos. Feche o que não vende mais — o histórico fica."
        />
        <Link
          href="/produtos/novo"
          className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-2xl bg-orange-600 px-5 text-lg font-bold text-white hover:bg-orange-700"
        >
          + Novo produto
        </Link>
      </div>

      {products?.length ? (
        <div className="mb-5">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar produto ou tipo..." />
        </div>
      ) : null}

      {!products?.length ? (
        <Empty
          title="Ainda não tem produto cadastrado"
          hint="Comece pela coxinha, risole ou a bebida que vocês mais vendem."
          action={
            <Link
              href="/produtos/novo"
              className="inline-flex min-h-14 items-center rounded-2xl bg-orange-600 px-5 text-lg font-bold text-white"
            >
              Cadastrar o primeiro
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <Empty title="Nada com esse nome" hint="Tente outro trecho: coxinha, mini, coca." />
      ) : (
        <div>
          <PageBoard ref={list.listRef} size={list.size} rowMin="11rem">
            {list.rows.map((product) => {
              const types = (niches ?? []).filter((niche) => niche.productId === product.id);
              const live = productIsLive(product);
              return (
                <Card key={product.id} className="flex h-full flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold uppercase text-orange-700">
                          {categoryLabel(product.category)}
                          {product.perishable ? " · perecível" : ""}
                        </p>
                        <h2 className="text-2xl font-extrabold text-stone-900">{product.name}</h2>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {live ? null : (
                          <span className="rounded-full bg-stone-200 px-3 py-1 text-sm font-bold text-stone-700">
                            Fechado
                          </span>
                        )}
                        <Link
                          href={`/produtos/${product.id}`}
                          className="rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-800 hover:bg-orange-100"
                        >
                          Editar
                        </Link>
                      </div>
                    </div>
                    <ul className="mt-4 space-y-1 text-lg text-stone-700">
                      {types.map((niche) => (
                        <li key={niche.id}>
                          {niche.name} · vende por {formatBRL(niche.sellPrice)}
                          {!niche.active ? " · escondido" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4">
                    <ProductCloseControls product={product} stockQty={productStockQty(stock ?? [], product.id)} />
                  </div>
                </Card>
              );
            })}
          </PageBoard>
          <Pager page={list.page} pages={list.pages} total={list.total} onPage={list.setPage} word="produtos" />
        </div>
      )}
    </AppShell>
    </AccessGate>
  );
}
