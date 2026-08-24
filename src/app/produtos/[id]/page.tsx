"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { BackLink } from "@/components/BackLink";
import { Empty, PageTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { productIsLive } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function EditarProdutoPage() {
  const ready = useReady();
  const params = useParams();
  const id = String(params.id);
  const product = useLiveQuery(
    () => (ready ? getDb().products.get(id).then((row) => row ?? null) : undefined),
    [ready, id],
  );
  const niches = useLiveQuery(
    () => (ready ? getDb().niches.where("productId").equals(id).toArray() : []),
    [ready, id],
  );

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Edição de produto é da administração e da fábrica"
      hint="A loja não altera cadastro. Isso fica com a administração e a fábrica."
    >
    <AppShell>
      <PageTitle
        title="Editar produto"
        hint={
          product && !productIsLive(product)
            ? "Produto fechado: some da venda. Ainda dá para mudar cadastro e reativar."
            : "Mude o nome, os preços, a validade ou acrescente um tipo novo. Dá para fechar o produto sem apagar o histórico."
        }
      />
      {product === undefined ? (
        <p className="font-extrabold text-stone-600">Carregando o produto...</p>
      ) : product === null ? (
        <Empty
          title="Produto não encontrado"
          hint="Volte na lista e toque no produto de novo."
          action={<BackLink href="/produtos" label="Voltar para produtos" />}
        />
      ) : (
        <ProductForm product={product} niches={niches ?? []} />
      )}
    </AppShell>
    </AccessGate>
  );
}
