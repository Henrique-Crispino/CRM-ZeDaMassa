"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/pick-flow";
import { Button } from "@/components/ui";
import { setProductActive } from "@/lib/queries";
import { productIsLive, type Product } from "@/lib/types";

export function ProductCloseControls({
  product,
  stockQty,
}: {
  product: Product;
  stockQty: number;
}) {
  const live = productIsLive(product);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await setProductActive(product.id, !live);
      setOpen(false);
    } catch {
      setError("Não deu para atualizar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <Button type="button" variant={live ? "ghost" : "soft"} onClick={() => setOpen(true)}>
          {live ? "Fechar produto" : "Reativar produto"}
        </Button>
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
      <ConfirmDialog
        open={open}
        title={live ? `Fechar ${product.name}?` : `Reativar ${product.name}?`}
        hint={
          live
            ? "Some da venda, da produção, do pedido e do envio. Não apaga o histórico."
            : "Volta a aparecer no catálogo vivo."
        }
        confirmLabel={live ? "Fechar produto" : "Reativar"}
        confirmVariant={live ? "danger" : "primary"}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
      >
        {live && stockQty > 0 ? (
          <p className="text-lg font-semibold text-stone-800">
            Ainda tem {stockQty} un. em estoque. O saldo não some neste clique — baixa no inventário
            ou no descarte.
          </p>
        ) : live ? (
          <p className="text-lg text-stone-700">Lotes, vendas antigas e o extrato continuam no sistema.</p>
        ) : (
          <p className="text-lg text-stone-700">
            Vender, produzir, pedir e mandar voltam a mostrar este produto.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
