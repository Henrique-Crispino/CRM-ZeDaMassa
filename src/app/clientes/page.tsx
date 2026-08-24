"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MapPin, Phone } from "lucide-react";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Pager, usePager } from "@/components/pager";
import { SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { CustomerError, listCustomers, removeCustomer, saveCustomer } from "@/lib/customers";
import { useReady } from "@/lib/use-ready";

const emptyForm = { id: "", name: "", phone: "", note: "", address: "" };

export default function ClientesPage() {
  const ready = useReady();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const customers = useLiveQuery(() => (ready ? listCustomers() : []), [ready]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = customers ?? [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.phone, row.note, row.address].some((field) => field.toLowerCase().includes(q)),
    );
  }, [customers, search]);
  const list = usePager(visible, 8);

  function resetForm() {
    setForm(emptyForm);
    setError("");
  }

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Clientes ficam na fábrica"
      hint="A loja não cadastra cliente. Quem encomenda festa ou retirada entra na fábrica."
    >
      <AppShell>
        <PageTitle
          title="Clientes"
          hint="Nome, telefone e um recado. Serve para achar quem encomenda festa — não é funil, nota fiscal nem crédito."
        />

        <Card className="mb-6 space-y-4">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Dona Márcia"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Ex.: (11) 98888-1010"
            />
          </Field>
          <Field label="Endereço" hint="Opcional. Rua e bairro bastam.">
            <Input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="Ex.: Rua das Flores, 120"
            />
          </Field>
          <Field label="Observação">
            <Input
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Ex.: Festa sábado. Retirada na fábrica."
            />
          </Field>
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setError("");
                setOk("");
                setSaving(true);
                try {
                  await saveCustomer({
                    id: form.id || undefined,
                    name: form.name,
                    phone: form.phone,
                    note: form.note,
                    address: form.address,
                  });
                  setOk(form.id ? "Cadastro atualizado." : "Cliente na lista. A fábrica acha pelo nome ou telefone.");
                  resetForm();
                } catch (err) {
                  setError(err instanceof CustomerError ? err.message : "Não deu para salvar o cliente.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Salvando..." : form.id ? "Salvar alteração" : "Cadastrar cliente"}
            </Button>
            {form.id ? (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </Card>

        <div className="mb-4">
          <SearchField value={search} onChange={setSearch} placeholder="Achar por nome, telefone ou recado..." />
        </div>

        {!customers?.length ? (
          <Empty title="Nenhum cliente ainda" hint="Cadastre quem encomenda festa ou retirada. Ex.: Dona Márcia — festa sábado." />
        ) : visible.length === 0 ? (
          <Empty
            title={`Nada com “${search.trim()}”`}
            hint="Limpe a busca ou tente o telefone."
            action={
              <Button type="button" variant="ghost" onClick={() => setSearch("")}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <div ref={list.listRef} className="mt-4 scroll-mt-36 space-y-3">
            {list.rows.map((customer) => (
              <Card key={customer.id} className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold text-stone-900">{customer.name}</p>
                  {customer.note ? <p className="mt-1 font-semibold text-stone-600">{customer.note}</p> : null}
                  <p className="mt-2 flex items-center gap-2 text-stone-700">
                    <Phone className="size-4 shrink-0 text-orange-600" />
                    {customer.phone || "Telefone ainda não informado"}
                  </p>
                  {customer.address ? (
                    <p className="mt-1 flex items-start gap-2 text-stone-700">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-orange-600" />
                      {customer.address}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12"
                    onClick={() => {
                      setForm({
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        note: customer.note,
                        address: customer.address,
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
                      await removeCustomer(customer.id);
                      if (form.id === customer.id) resetForm();
                      setOk("Cliente saiu da lista.");
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </Card>
            ))}
            <Pager
              page={list.page}
              pages={list.pages}
              total={list.total}
              onPage={list.setPage}
              word="clientes"
            />
          </div>
        )}
      </AppShell>
    </AccessGate>
  );
}
