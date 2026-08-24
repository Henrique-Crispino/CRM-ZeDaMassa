"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MapPin, Phone } from "lucide-react";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { Pager, usePager } from "@/components/pager";
import { getDb } from "@/lib/db";
import { removeStore, saveStore, StoreError } from "@/lib/stores";
import { useReady } from "@/lib/use-ready";

const emptyForm = { name: "", address: "", phone: "" };

export default function LojasPage() {
  const ready = useReady();
  const stores = useLiveQuery(() => (ready ? getDb().stores.toArray() : []), [ready]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = (stores ?? []).filter((store) => store.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const list = usePager(visible, 8);

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      await saveStore({
        id: editingId ?? undefined,
        name: form.name,
        address: form.address,
        phone: form.phone,
      });
      setForm(emptyForm);
      setEditingId(null);
      setOk(editingId ? "Loja atualizada." : "Loja cadastrada. Ela já aparece na tela inicial.");
    } catch (err) {
      setError(err instanceof StoreError ? err.message : "Não deu para salvar a loja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate
      allow={["admin"]}
      title="Só a administração gerencia lojas"
      hint="Cadastro, edição e remoção de lojas ficam no painel do admin."
    >
      <AppShell>
        <PageTitle
          title="Lojas"
          hint="Cadastre cada ponto de venda com nome, endereço e telefone. A fábrica continua sendo um local do sistema."
        />

        <Card className="mb-6 space-y-4">
          <Field label={editingId ? "Nome da loja" : "Nome da nova loja"}>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Loja Centro"
            />
          </Field>
          <Field label="Endereço" hint="Rua, número e bairro ajudam a identificar o ponto.">
            <Input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="Ex.: Rua das Flores, 120 — Centro"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Ex.: (11) 3333-1001"
            />
          </Field>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={save}>
              {saving ? "Salvando..." : editingId ? "Salvar alteração" : "Adicionar loja"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </Card>

        {visible.length === 0 ? (
          <Empty title="Nenhuma loja ativa" hint="Cadastre a primeira loja para vender." />
        ) : (
          <div className="space-y-3">
            {list.rows.map((store) => (
              <Card key={store.id} className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold text-stone-900">{store.name}</p>
                  <p className="mt-2 flex items-start gap-2 text-stone-700">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-orange-600" />
                    {store.address || "Endereço ainda não informado"}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-stone-700">
                    <Phone className="size-4 shrink-0 text-orange-600" />
                    {store.phone || "Telefone ainda não informado"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12"
                    onClick={() => {
                      setEditingId(store.id);
                      setForm({
                        name: store.name,
                        address: store.address ?? "",
                        phone: store.phone ?? "",
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
                      setError("");
                      setOk("");
                      try {
                        await removeStore(store.id);
                        setOk("Loja removida.");
                      } catch (err) {
                        setError(err instanceof StoreError ? err.message : "Não deu para remover.");
                      }
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </Card>
            ))}
            <Pager page={list.page} pages={list.pages} total={list.total} onPage={list.setPage} word="lojas" />
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
