"use client";

import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { PageTitle } from "@/components/ui";

export default function NovoProdutoPage() {
  return (
    <AppShell>
      <PageTitle
        title="Novo produto"
        hint="Preencha o nome e os tipos. Se o mesmo salgado for Mini e Festa, cadastre os dois tipos aqui."
      />
      <ProductForm />
    </AppShell>
  );
}
