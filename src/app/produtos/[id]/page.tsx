"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { Empty, PageTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { useReady } from "@/lib/use-ready";

export default function EditarProdutoPage() {
  const ready = useReady();
  const params = useParams();
  const id = String(params.id);
  const product = useLiveQuery(() => (ready ? getDb().products.get(id) : undefined), [ready, id]);
  const niches = useLiveQuery(
    () => (ready ? getDb().niches.where("productId").equals(id).toArray() : []),
    [ready, id],
  );

  return (
    <AppShell>
      <PageTitle title="Editar produto" hint="Mude o nome, os preços ou acrescente um tipo novo." />
      {product ? (
        <ProductForm product={product} niches={niches ?? []} />
      ) : (
        <Empty title="Produto não encontrado" hint="Volte na lista e toque no produto de novo." />
      )}
    </AppShell>
  );
}
