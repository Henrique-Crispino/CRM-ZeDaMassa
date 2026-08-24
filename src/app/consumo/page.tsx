"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { Pager, usePager } from "@/components/pager";
import { Button, Card, Empty, ErrorBox, Field, Input, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import {
  ConsumeError,
  consumeWorkplaceLabel,
  consumeWorkplaces,
  listAllowances,
  listConsumeGroups,
  listConsumeUsers,
  listConsumptions,
  removeConsumeGroup,
  removeConsumeUser,
  saveAllowance,
  saveConsumeGroup,
  saveConsumeUser,
} from "@/lib/consume";
import { isSoldAtRegister } from "@/lib/categories";
import { getLocation, useLocationCatalog } from "@/lib/locations";
import { formatDate, formatTime } from "@/lib/money";
import { useReady } from "@/lib/use-ready";

const emptyUser = { name: "", login: "", password: "", locationId: "" };
const emptyGroup = { id: "", name: "", personLimit: 3, nicheIds: [] as string[], enabled: true };

export default function ConsumoAdminPage() {
  const ready = useReady();
  useLocationCatalog();
  const places = consumeWorkplaces();
  const users = useLiveQuery(() => (ready ? listConsumeUsers() : []), [ready]);
  const items = useLiveQuery(() => (ready ? listAllowances() : []), [ready]);
  const groups = useLiveQuery(() => (ready ? listConsumeGroups() : []), [ready]);
  const history = useLiveQuery(() => (ready ? listConsumptions("admin") : []), [ready]);
  const usersPage = usePager(users ?? [], 8);
  const itemsPage = usePager(items ?? [], 8);
  const groupsPage = usePager(groups ?? [], 8);
  const historyPage = usePager(history ?? [], 8);
  const [tab, setTab] = useState<"users" | "products" | "groups">("users");
  const [form, setForm] = useState(emptyUser);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [personLimits, setPersonLimits] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!form.locationId && places[0]) {
      setForm((current) => ({ ...current, locationId: places[0].id }));
    }
  }, [form.locationId, places]);

  return (
    <AccessGate
      allow={["admin"]}
      title="O consumo interno é configurado pela administração"
      hint="Aqui você habilita o funcionário, a identificação, a senha e os produtos liberados."
    >
      <AppShell>
        <PageTitle
          title="Consumo interno"
          hint="A equipe é uma só — a mesma ficha de Equipe. Aqui você liga o consumo, a senha, os produtos e a cota de grupo (3 salgados locais, misturados)."
        />

        <div className="mb-6 flex flex-wrap gap-2">
          <Button type="button" variant={tab === "users" ? "primary" : "ghost"} onClick={() => setTab("users")}>
            Funcionários habilitados
          </Button>
          <Button type="button" variant={tab === "products" ? "primary" : "ghost"} onClick={() => setTab("products")}>
            Produtos liberados
          </Button>
          <Button type="button" variant={tab === "groups" ? "primary" : "ghost"} onClick={() => setTab("groups")}>
            Cota de grupo
          </Button>
        </div>

        <ErrorBox message={error} />
        <SuccessBox message={ok} />

        {tab === "users" ? (
          <>
            <Card className="mb-6 mt-4 space-y-4">
              <Field label="Nome">
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Ana Souza"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Identificação" hint="O que a pessoa digita para se identificar. Sem espaço, minúsculo.">
                  <Input
                    value={form.login}
                    onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
                    placeholder="Ex.: ana.souza"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label={editingId ? "Nova senha (opcional)" : "Senha"}
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
              <div>
                <p className="mb-2 font-bold">Onde esta pessoa trabalha</p>
                <p className="mb-2 text-sm text-stone-500">
                  Fábrica: retira 1× ao dia em qualquer loja. Loja: retira só neste ponto.
                </p>
                <div className="flex flex-wrap gap-2">
                  {places.map((place) => (
                    <Button
                      key={place.id}
                      type="button"
                      variant={form.locationId === place.id ? "primary" : "ghost"}
                      className="min-h-12"
                      onClick={() => setForm((current) => ({ ...current, locationId: place.id }))}
                    >
                      {place.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    setError("");
                    setOk("");
                    try {
                      await saveConsumeUser({
                        id: editingId ?? undefined,
                        name: form.name,
                        login: form.login,
                        password: form.password,
                        locationId: form.locationId || places[0]?.id || "",
                      });
                      setForm({ ...emptyUser, locationId: form.locationId });
                      setEditingId(null);
                      setOk(editingId ? "Funcionário atualizado." : "Funcionário habilitado para consumo interno.");
                    } catch (err) {
                      setError(err instanceof ConsumeError ? err.message : "Não deu para salvar.");
                    }
                  }}
                >
                  {editingId ? "Salvar funcionário" : "Habilitar funcionário"}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ ...emptyUser, locationId: places[0]?.id ?? "" });
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </Card>

            {!users?.length ? (
              <Empty
                title="Ninguém habilitado ainda"
                hint="Cadastre a identificação e a senha de cada funcionário que pode lançar consumo interno."
              />
            ) : (
              <div ref={usersPage.listRef} className="scroll-mt-36 space-y-3">
                {usersPage.rows.map((user) => (
                  <Card key={user.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold">{user.name}</p>
                      <p className="text-sm font-semibold text-stone-500">
                        ID {user.login} · {consumeWorkplaceLabel(user.locationId)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-12"
                        onClick={() => {
                          setEditingId(user.id);
                          setForm({
                            name: user.name,
                            login: user.login,
                            password: "",
                            locationId: user.locationId,
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
                          await removeConsumeUser(user.id);
                          setOk("Funcionário desabilitado.");
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  </Card>
                ))}
                <Pager
                  page={usersPage.page}
                  pages={usersPage.pages}
                  total={usersPage.total}
                  onPage={usersPage.setPage}
                  word="funcionários"
                />
              </div>
            )}
          </>
        ) : tab === "products" ? (
          <>
            <h2 className="mb-3 mt-4 text-2xl font-extrabold">Produtos liberados</h2>
            {!items?.length ? (
              <Empty title="Cadastre produtos primeiro" />
            ) : (
              <div ref={itemsPage.listRef} className="scroll-mt-36 space-y-3">
                {itemsPage.rows.map((item) => {
                  const limit = limits[item.niche.id] ?? item.allowance.dailyLimit;
                  const personLimit = personLimits[item.niche.id] ?? item.allowance.personLimit ?? 1;
                  return (
                    <Card key={item.niche.id} className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-extrabold">{item.label}</p>
                          <p className="text-sm text-stone-500">
                            {item.allowance.enabled
                              ? `Liberado · loja ${item.allowance.dailyLimit} / dia · pessoa ${item.allowance.personLimit ?? 1} / dia`
                              : "Bloqueado"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant={item.allowance.enabled ? "primary" : "ghost"}
                          className="min-h-12"
                          onClick={async () => {
                            setError("");
                            setOk("");
                            try {
                              await saveAllowance({
                                id: item.niche.id,
                                nicheId: item.niche.id,
                                enabled: !item.allowance.enabled,
                                dailyLimit: limit || item.allowance.dailyLimit || 1,
                                personLimit: personLimit || 1,
                              });
                              setOk(`${item.label} ${item.allowance.enabled ? "bloqueado" : "liberado"}.`);
                            } catch (err) {
                              setError(err instanceof ConsumeError ? err.message : "Não deu para salvar.");
                            }
                          }}
                        >
                          {item.allowance.enabled ? "Liberado" : "Bloqueado"}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <Field label="Nesta loja / dia" hint="Teto de todo o time neste ponto.">
                          <NumberStepper
                            value={limit}
                            onChange={(value) => setLimits((current) => ({ ...current, [item.niche.id]: value }))}
                          />
                        </Field>
                        <Field label="Cada pessoa / dia" hint="Vem primeiro. Ana não come o teto da loja sozinha.">
                          <NumberStepper
                            value={personLimit}
                            onChange={(value) => setPersonLimits((current) => ({ ...current, [item.niche.id]: value }))}
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="soft"
                          className="min-h-12"
                          onClick={async () => {
                            setError("");
                            setOk("");
                            try {
                              await saveAllowance({
                                id: item.niche.id,
                                nicheId: item.niche.id,
                                enabled: item.allowance.enabled,
                                dailyLimit: limit,
                                personLimit,
                              });
                              setOk("Limites do dia salvos.");
                            } catch (err) {
                              setError(err instanceof ConsumeError ? err.message : "Não deu para salvar.");
                            }
                          }}
                        >
                          Salvar limites
                        </Button>
                      </div>
                    </Card>
                  );
                })}
                <Pager
                  page={itemsPage.page}
                  pages={itemsPage.pages}
                  total={itemsPage.total}
                  onPage={itemsPage.setPage}
                  word="produtos"
                />
              </div>
            )}

            <h2 className="mb-3 mt-8 text-2xl font-extrabold">Últimos consumos</h2>
            {!history?.length ? (
              <Empty title="Nenhum consumo interno ainda" />
            ) : (
              <div ref={historyPage.listRef} className="scroll-mt-36 space-y-2">
                {historyPage.rows.map((row) => (
                  <Card key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      {row.qty} un. · {getLocation(row.locationId)?.name ?? row.locationId}
                      {row.userName ? ` · ${row.userName}` : ""}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDate(row.dayKey)} às {formatTime(row.at)}
                    </p>
                  </Card>
                ))}
                <Pager
                  page={historyPage.page}
                  pages={historyPage.pages}
                  total={historyPage.total}
                  onPage={historyPage.setPage}
                  word="consumos"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-3 mt-4 text-2xl font-extrabold">Cota de grupo</h2>
            <p className="mb-4 max-w-2xl text-base leading-relaxed text-stone-600">
              Além do teto de cada produto, a cota vale para todos os marcados juntos. Exemplo: até 3
              salgados locais por pessoa no dia — coxinha, pastel ou kibe, misturados.
            </p>
            <Card className="mb-6 space-y-4">
              <Field label="Nome da cota">
                <Input
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Salgados locais"
                />
              </Field>
              <Field
                label="Cada pessoa / dia neste grupo"
                hint="A soma conta. 2 pastéis + 1 coxinha = 3. O quarto item para."
              >
                <NumberStepper
                  value={groupForm.personLimit}
                  min={1}
                  onChange={(value) => setGroupForm((current) => ({ ...current, personLimit: value }))}
                />
              </Field>
              <div>
                <p className="mb-2 font-bold">Quais produtos entram nesta cota</p>
                <p className="mb-2 text-sm text-stone-500">Marque pelo menos dois. Coca e limpeza ficam de fora se você não marcar.</p>
                <div className="flex flex-wrap gap-2">
                  {(items ?? [])
                    .filter((item) => isSoldAtRegister(item.product.category))
                    .map((item) => {
                      const on = groupForm.nicheIds.includes(item.niche.id);
                      return (
                        <Button
                          key={item.niche.id}
                          type="button"
                          variant={on ? "primary" : "ghost"}
                          className="min-h-12"
                          onClick={() =>
                            setGroupForm((current) => ({
                              ...current,
                              nicheIds: on
                                ? current.nicheIds.filter((id) => id !== item.niche.id)
                                : [...current.nicheIds, item.niche.id],
                            }))
                          }
                        >
                          {item.label}
                        </Button>
                      );
                    })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={groupForm.enabled ? "primary" : "ghost"}
                  onClick={() => setGroupForm((current) => ({ ...current, enabled: !current.enabled }))}
                >
                  {groupForm.enabled ? "Cota ligada" : "Cota desligada"}
                </Button>
                <Button
                  onClick={async () => {
                    setError("");
                    setOk("");
                    try {
                      await saveConsumeGroup({
                        id: groupForm.id || undefined,
                        name: groupForm.name,
                        enabled: groupForm.enabled,
                        personLimit: groupForm.personLimit,
                        nicheIds: groupForm.nicheIds,
                      });
                      setGroupForm(emptyGroup);
                      setOk(groupForm.id ? "Cota de grupo atualizada." : "Cota de grupo salva.");
                    } catch (err) {
                      setError(err instanceof ConsumeError ? err.message : "Não deu para salvar a cota.");
                    }
                  }}
                >
                  {groupForm.id ? "Salvar cota" : "Criar cota"}
                </Button>
                {groupForm.id ? (
                  <Button type="button" variant="ghost" onClick={() => setGroupForm(emptyGroup)}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </Card>

            {!groups?.length ? (
              <Empty
                title="Nenhuma cota de grupo ainda"
                hint="Sem isso, o teto continua só por produto: 2 coxinha, 1 pastel, cada um na sua conta."
              />
            ) : (
              <div ref={groupsPage.listRef} className="scroll-mt-36 space-y-3">
                {groupsPage.rows.map((group) => {
                  const labels = (items ?? [])
                    .filter((item) => group.nicheIds.includes(item.niche.id))
                    .map((item) => item.label);
                  return (
                    <Card key={group.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-extrabold">{group.name}</p>
                        <p className="text-sm font-semibold text-stone-500">
                          {group.enabled
                            ? `${group.personLimit} un. / pessoa / dia · ${labels.join(" · ") || "produtos"}`
                            : "Desligada"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-12"
                          onClick={() => {
                            setGroupForm({
                              id: group.id,
                              name: group.name,
                              personLimit: group.personLimit,
                              nicheIds: group.nicheIds,
                              enabled: group.enabled,
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
                            await removeConsumeGroup(group.id);
                            if (groupForm.id === group.id) setGroupForm(emptyGroup);
                            setOk("Cota de grupo removida.");
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </Card>
                  );
                })}
                <Pager
                  page={groupsPage.page}
                  pages={groupsPage.pages}
                  total={groupsPage.total}
                  onPage={groupsPage.setPage}
                  word="cotas"
                />
              </div>
            )}
          </>
        )}
      </AppShell>
    </AccessGate>
  );
}
