"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Pager, usePager } from "@/components/pager";
import { SearchField } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, Field, Input, PageTitle, SuccessBox } from "@/components/ui";
import { CustomerError, listCustomers, removeCustomer, saveCustomer, suggestUsualWeekdays, usualWeekdaysLabel } from "@/lib/customers";
import { CUSTOMER_KINDS, WEEKDAYS, customerKind, customerKindLabel, type CustomerKind } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

const emptyForm = { id: "", name: "", phone: "", note: "", address: "", kind: "festa" as CustomerKind, usualWeekdays: [] as number[] };

export default function ClientesPage() {
  const ready = useReady();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerKind | "todos">("todos");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const customers = useLiveQuery(() => (ready ? listCustomers() : undefined), [ready]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customers ?? []).filter((row) => {
      if (filter !== "todos" && customerKind(row) !== filter) return false;
      if (!q) return true;
      return [row.name, row.phone, row.note, row.address].some((field) => field.toLowerCase().includes(q));
    });
  }, [customers, filter, search]);
  const list = usePager(visible, 8, `${filter}|${search}`);

  function resetForm() {
    setForm(emptyForm);
    setError("");
  }

  const formCard = (
    <Card className="mb-6 space-y-4">
      <p className="text-lg font-extrabold">{form.id ? "Editar cliente" : "Novo cliente"}</p>
      <Field label="Nome">
        <Input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Ex.: Dona Márcia"
        />
      </Field>
      <div>
        <p className="mb-2 font-bold">Como este cliente compra</p>
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_KINDS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={form.kind === item.id ? "primary" : "ghost"}
              className="min-h-12"
              onClick={() => setForm((current) => ({ ...current, kind: item.id }))}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-sm text-stone-500">
          Festa é retirada pontual. Compra na fábrica é quantidade grande de salgado, direto da câmara — o pedido vem no próximo
          passo. Bebida não sai daqui.
        </p>
      </div>
      {form.kind === "volume" ? (
        <div>
          <p className="mb-2 font-bold">Costuma pedir</p>
          <p className="mb-2 text-sm text-stone-500">A Rita marca. Não inventa quantidade. O sino avisa na véspera.</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const on = form.usualWeekdays.includes(day.id);
              return (
                <Button
                  key={day.id}
                  type="button"
                  variant={on ? "primary" : "ghost"}
                  className="min-h-11"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      usualWeekdays: on
                        ? current.usualWeekdays.filter((id) => id !== day.id)
                        : [...current.usualWeekdays, day.id],
                    }))
                  }
                >
                  {day.short}
                </Button>
              );
            })}
          </div>
          {form.id ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 min-h-11 text-sm"
              onClick={async () => {
                const days = await suggestUsualWeekdays(form.id);
                setForm((current) => ({ ...current, usualWeekdays: days }));
              }}
            >
              Sugerir pelos últimos pedidos
            </Button>
          ) : null}
        </div>
      ) : null}
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
                kind: form.kind,
                usualWeekdays: form.kind === "volume" ? form.usualWeekdays : [],
              });
              setOk(
                form.id
                  ? "Cadastro atualizado."
                  : form.kind === "volume"
                    ? "Cliente marcado para compra na fábrica. O pedido ainda não baixa estoque."
                    : "Cliente na lista. A fábrica acha pelo nome ou telefone.",
              );
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
  );

  return (
    <AccessGate
      allow={["admin", "factory"]}
      title="Clientes ficam na fábrica"
      hint="A loja não cadastra cliente. Quem encomenda festa ou compra em quantidade entra na fábrica."
    >
      <AppShell>
        <PageTitle
          title="Clientes"
          hint="Festa ou compra na fábrica. Quem compra na fábrica marca o dia em que costuma pedir."
        />

        {form.id ? formCard : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant={filter === "todos" ? "primary" : "ghost"} onClick={() => setFilter("todos")}>
            Tudo
          </Button>
          {CUSTOMER_KINDS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={filter === item.id ? "primary" : "ghost"}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="mb-4">
          <SearchField value={search} onChange={setSearch} placeholder="Achar por nome, telefone ou recado..." />
        </div>

        {customers === undefined ? (
          <Card className="mb-6">
            <p className="text-lg font-bold text-stone-600">Carregando os clientes...</p>
          </Card>
        ) : !customers.length ? (
          <Empty title="Nenhum cliente ainda" hint="Cadastre quem encomenda festa ou quem compra na fábrica." />
        ) : visible.length === 0 ? (
          <Empty
            title={search.trim() ? `Nada com “${search.trim()}”` : "Ninguém neste tipo"}
            hint={search.trim() ? "Limpe a busca ou tente o telefone." : "Volte em Tudo para ver a lista inteira."}
            action={
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setFilter("todos");
                }}
              >
                Limpar
              </Button>
            }
          />
        ) : (
          <div ref={list.listRef} className="mb-8 scroll-mt-36 space-y-3">
            {list.rows.map((customer) => (
              <Card key={customer.id} className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-orange-800">
                    {customerKindLabel(customerKind(customer))}
                  </p>
                  <p className="text-xl font-extrabold text-stone-900">{customer.name}</p>
                  {customer.note ? <p className="mt-1 font-semibold text-stone-600">{customer.note}</p> : null}
                  {customerKind(customer) === "volume" && usualWeekdaysLabel(customer.usualWeekdays) ? (
                    <p className="mt-1 text-sm font-semibold text-orange-800">
                      Costuma pedir {usualWeekdaysLabel(customer.usualWeekdays)}
                    </p>
                  ) : null}
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
                  {customerKind(customer) === "volume" ? (
                    <Link
                      href={`/clientes/${customer.id}/pedido`}
                      className="inline-flex min-h-12 items-center rounded-2xl bg-orange-600 px-4 text-base font-bold text-white hover:bg-orange-700 sm:min-h-14 sm:px-5 sm:text-lg"
                    >
                      Separar pedido
                    </Link>
                  ) : null}
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
                        kind: customerKind(customer),
                        usualWeekdays: customer.usualWeekdays ?? [],
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

        {!form.id ? formCard : null}
      </AppShell>
    </AccessGate>
  );
}
