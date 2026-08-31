"use client";

import { useEffect } from "react";
import { Button, Card, PageTitle } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <Card className="space-y-4">
        <PageTitle
          title="Não deu para abrir o sistema"
          hint="O protótipo falhou ao carregar os dados locais. Tente de novo. Se repetir, avise quem cuida do projeto."
        />
        <p className="text-sm font-semibold text-red-800">{error.message || "Erro desconhecido."}</p>
        <Button type="button" onClick={() => reset()}>
          Tentar de novo
        </Button>
      </Card>
    </main>
  );
}
