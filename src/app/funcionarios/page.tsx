"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { consumeWorkplaceLabel, consumeWorkplaces } from "@/lib/consume";
import {
  deactivatePerson,
  listPeople,
  PeopleError,
  personCanCash,
  personCanConsume,
  personLocation,
  personRoleHint,
  savePerson,
} from "@/lib/people";
import { useReady } from "@/lib/use-ready";

const emptyForm = {
  name: "",
  locationId: "",
  podeCaixa: true,
  podeConsumo: false,
  login: "",
  password: "",
};

export default function FuncionariosPage() {
  const ready = useReady();
  const places = consumeWorkplaces();
  const people = useLiveQuery(() => (ready ? listPeople() : []), [ready]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!form.locationId && places[0]) {
      setForm((current) => ({ ...current, locationId: places.find((place) => place.id !== "factory")?.id ?? places[0].id }));
    }
  }, [form.locationId, places]);

  const active = (people ?? []).filter((item) => item.active);
  const list = usePager(active, 8);

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      locationId: places.find((place) => place.id !== "factory")?.id ?? places[0]?.id ?? "",
    });
  }

  return (
    <AccessGate
      allow={["admin"]}
      title="A equipe é cadastrada pela administração"
      hint="Uma ficha só: quem abre o caixa e quem retira consumo interno."
    >
      <AppShell>
        <PageTitle
          title="Equipe"
          hint="Uma pessoa, um cadastro. Caixa e consumo interno leem esta lista. Editar Ana aqui atualiza os dois lados."
        />

        <Card className="mb-6 space-y-4">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Ana Souza"
            />
          </Field>
          <div>
            <p className="mb-2 font-bold">Onde esta pessoa trabalha</p>
            <p className="mb-2 text-sm text-stone-500">
              Loja: pode abrir o caixa e retirar consumo no ponto. Fábrica: retira 1× ao dia em qualquer loja, sem caixa.
            </p>
            <div className="flex flex-wrap gap-2">
              {places.map((place) => (
                <Button
                  key={place.id}
                  type="button"
                  variant={form.locationId === place.id ? "primary" : "ghost"}
                  className="min-h-12"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      locationId: place.id,
                      podeCaixa: place.id === "factory" ? false : current.podeCaixa,
                    }))
                  }
                >
                  {place.name}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-bold">Papéis</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.podeCaixa ? "secondary" : "ghost"}
                disabled={form.locationId === "factory"}
                onClick={() => setForm((current) => ({ ...current, podeCaixa: !current.podeCaixa }))}
              >
                {form.podeCaixa ? "Abre o caixa" : "Sem caixa"}
              </Button>
              <Button
                type="button"
                variant={form.podeConsumo ? "secondary" : "ghost"}
                onClick={() => setForm((current) => ({ ...current, podeConsumo: !current.podeConsumo }))}
              >
                {form.podeConsumo ? "Consome interno" : "Sem consumo"}
              </Button>
            </div>
          </div>
          {form.podeConsumo ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Identificação" hint="O que a pessoa digita no consumo. Sem espaço, minúsculo.">
                <Input
                  value={form.login}
                  onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
                  placeholder="Ex.: ana.souza"
                  autoComplete="off"
                />
              </Field>
              <Field
                label={editingId ? "Nova senha (opcional)" : "Senha do consumo"}
                hint={editingId ? "Deixe em branco para manter a senha atual." : "Mínimo 4 caracteres."}
              >
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={editingId ? "••••" : "Mínimo 4 caracteres"}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          ) : null}
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setError("");
                setOk("");
                try {
                  await savePerson({
                    id: editingId ?? undefined,
                    name: form.name,
                    locationId: form.locationId || places[0]?.id || "",
                    podeCaixa: form.podeCaixa,
                    podeConsumo: form.podeConsumo,
                    login: form.login,
                    password: form.password,
                  });
                  setOk(editingId ? "Cadastro atualizado. Caixa e consumo já leem esta ficha." : "Pessoa cadastrada.");
                  resetForm();
                } catch (err) {
                  setError(err instanceof PeopleError ? err.message : "Não deu para salvar.");
                }
              }}
            >
              {editingId ? "Salvar pessoa" : "Adicionar à equipe"}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </Card>

        {!active.length ? (
          <Empty title="Ninguém cadastrado ainda" hint="Cadastre quem abre o caixa e quem retira consumo interno." />
        ) : (
          <div ref={list.listRef} className="scroll-mt-36 space-y-3">
            {list.rows.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold">{item.name}</p>
                  <p className="text-sm font-semibold text-stone-500">
                    {consumeWorkplaceLabel(personLocation(item))}
                    {personCanConsume(item) && item.login ? ` · ID ${item.login}` : ""}
                    {" · "}
                    {personRoleHint(item)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12"
                    onClick={() => {
                      setEditingId(item.id);
                      setForm({
                        name: item.name,
                        locationId: personLocation(item),
                        podeCaixa: personCanCash(item),
                        podeConsumo: personCanConsume(item),
                        login: item.login ?? "",
                        password: "",
                      });
                      setOk("");
                      setError("");
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="min-h-12"
                    onClick={async () => {
                      await deactivatePerson(item.id);
                      if (editingId === item.id) resetForm();
                      setOk("Removido da equipe.");
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </Card>
            ))}
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={list.setPage} word="pessoas" />
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
