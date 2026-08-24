"use client";

import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { ProductForm } from "@/components/ProductForm";
import { PageTitle } from "@/components/ui";

export default function NovoProdutoPage() {
  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Cadastro de produto é da administração e da fábrica"
      hint="A loja não cadastra produto. Isso fica com a administração e a fábrica."
    >
      <AppShell>
        <PageTitle
          title="Novo produto"
          hint="Preencha o nome, a categoria e os tipos. Se for perecível, informe os dias de validade."
        />
        <ProductForm />
      </AppShell>
    </AccessGate>
  );
}
