"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { CashError, listEmployees, removeEmployee, saveEmployee } from "@/lib/cash";
import { getDb } from "@/lib/db";
import { useLocationCatalog } from "@/lib/locations";
import { useReady } from "@/lib/use-ready";

export default function FuncionariosPage() {
  const ready = useReady();
  const { stores } = useLocationCatalog();
  const employees = useLiveQuery(() => (ready ? listEmployees() : []), [ready]);
  const all = useLiveQuery(() => (ready ? getDb().employees.toArray() : []), [ready]);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!storeId && stores[0]) setStoreId(stores[0].id);
  }, [storeId, stores]);

  const active = (employees ?? []).length ? employees : (all ?? []).filter((item) => item.active);

  return (
    <AccessGate
      allow={["admin"]}
      title="A equipe é cadastrada pela administração"
      hint="Cada funcionário fica ligado a uma loja para abrir o caixa do período."
    >
      <AppShell>
        <PageTitle
          title="Equipe das lojas"
          hint="Cadastre quem pode ficar responsável pelo caixa da manhã ou da tarde em cada loja."
        />

        <Card className="mb-6 space-y-4">
          <Field label="Nome">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Ana Souza" />
          </Field>
          <div>
            <p className="mb-2 font-bold">Loja</p>
            <div className="flex flex-wrap gap-2">
              {stores.map((store) => (
                <Button
                  key={store.id}
                  type="button"
                  variant={storeId === store.id ? "primary" : "ghost"}
                  className="min-h-12"
                  onClick={() => setStoreId(store.id)}
                >
                  {store.name}
                </Button>
              ))}
            </div>
          </div>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <Button
            onClick={async () => {
              setError("");
              setOk("");
              try {
                await saveEmployee({ name, storeId: storeId || stores[0]?.id || "" });
                setName("");
                setOk("Funcionário cadastrado.");
              } catch (err) {
                setError(err instanceof CashError ? err.message : "Não deu para salvar.");
              }
            }}
          >
            Adicionar à equipe
          </Button>
        </Card>

        {!active?.length ? (
          <Empty title="Nenhum funcionário ainda" hint="Cadastre quem abre o caixa de cada loja." />
        ) : (
          <div className="space-y-3">
            {active.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold">{item.name}</p>
                  <p className="text-sm font-semibold text-stone-500">
                    {stores.find((store) => store.id === item.storeId)?.name ?? item.storeId}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-12"
                  onClick={async () => {
                    await removeEmployee(item.id);
                    setOk("Removido da equipe.");
                  }}
                >
                  Remover
                </Button>
              </Card>
            ))}
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
