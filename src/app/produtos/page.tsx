"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { SearchField } from "@/components/pick-flow";
import { Card, Empty, PageTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { useReady } from "@/lib/use-ready";

export default function ProdutosPage() {
  const ready = useReady();
  const products = useLiveQuery(() => (ready ? getDb().products.orderBy("name").toArray() : []), [ready]);
  const niches = useLiveQuery(() => (ready ? getDb().niches.toArray() : []), [ready]);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      if (!q) return true;
      const types = (niches ?? []).filter((niche) => niche.productId === product.id);
      return (
        product.name.toLowerCase().includes(q) ||
        types.some((niche) => niche.name.toLowerCase().includes(q))
      );
    });
  }, [niches, products, search]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          title="Produtos"
          hint="Cadastre os salgados e as bebidas. Cada um pode ter vários tipos, com o próprio preço."
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
        <div className="space-y-4">
          {visible.map((product) => {
            const types = (niches ?? []).filter((niche) => niche.productId === product.id);
            return (
              <Link key={product.id} href={`/produtos/${product.id}`}>
                <Card className="mb-4 transition hover:ring-orange-300">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase text-orange-700">
                        {product.category === "salgado" ? "Salgado" : "Bebida"}
                      </p>
                      <h2 className="text-2xl font-extrabold text-stone-900">{product.name}</h2>
                    </div>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-800">
                      Editar
                    </span>
                  </div>
                  <ul className="mt-4 space-y-1 text-lg text-stone-700">
                    {types.map((niche) => (
                      <li key={niche.id}>
                        {niche.name} · vende por {formatBRL(niche.sellPrice)}
                        {!niche.active ? " · escondido" : ""}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
