"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/pick-flow";
import { Button, Card, Empty, ErrorBox, Field, Input, NumberStepper, PageTitle, SuccessBox } from "@/components/ui";
import {
  ConsumeError,
  consumePlaceName,
  isFactoryConsumeStaff,
  listConsumeUsers,
  registerInternalConsume,
  userConsumptionOnDay,
  consumedToday,
  listAllowances,
} from "@/lib/consume";
import { getPanel } from "@/lib/locations";
import { getLocationId } from "@/lib/session";
import { sellableQty, stockByLocation } from "@/lib/queries";
import { useReady } from "@/lib/use-ready";

export default function ConsumoInternoPage() {
  const ready = useReady();
  const locationId = ready ? getLocationId() : null;
  const panel = locationId ? getPanel(locationId) : undefined;
  const placeId = panel?.type === "store" ? locationId : null;
  const users = useLiveQuery(
    () => (ready && placeId ? listConsumeUsers(placeId) : []),
    [ready, placeId],
  );
  const allowances = useLiveQuery(() => (ready ? listAllowances() : []), [ready]);
  const stock = useLiveQuery(() => (ready ? stockByLocation() : []), [ready]);
  const used = useLiveQuery(
    () =>
      ready && placeId
        ? Promise.all(
            (allowances ?? [])
              .filter((item) => item.allowance.enabled)
              .map(async (item) => [item.niche.id, await consumedToday(placeId, item.niche.id)] as const),
          ).then((rows) => Object.fromEntries(rows) as Record<string, number>)
        : ({} as Record<string, number>),
    [ready, placeId, allowances],
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const chosen = (users ?? []).find((user) => user.login === login);
  const factoryToday = useLiveQuery(
    () =>
      ready && chosen && isFactoryConsumeStaff(chosen.locationId)
        ? userConsumptionOnDay(chosen.id)
        : [],
    [ready, chosen?.id, chosen?.locationId],
  );
  const factoryBlocked = Boolean(chosen && isFactoryConsumeStaff(chosen.locationId) && (factoryToday?.length ?? 0) > 0);

  const released = useMemo(() => {
    return (allowances ?? [])
      .filter((item) => item.allowance.enabled && item.allowance.dailyLimit > 0)
      .map((item) => {
        const row = stock?.find((entry) => entry.niche.id === item.niche.id);
        const available = row && placeId ? sellableQty(row, placeId) : 0;
        const already = used?.[item.niche.id] ?? 0;
        const remaining = factoryBlocked ? 0 : Math.max(0, item.allowance.dailyLimit - already);
        return { ...item, available, already, remaining };
      });
  }, [allowances, stock, placeId, used, factoryBlocked]);

  const selected = released.filter((item) => (qty[item.niche.id] ?? 0) > 0);

  async function save() {
    if (!placeId) return;
    setError("");
    setOk("");
    setSaving(true);
    try {
      await registerInternalConsume({
        locationId: placeId,
        login,
        password,
        items: selected.map((item) => ({ nicheId: item.niche.id, qty: qty[item.niche.id] ?? 0 })),
      });
      setQty({});
      setPassword("");
      setConfirm(false);
      setOk(`Consumo lançado no nome de ${chosen?.name ?? login}. O estoque da loja já foi atualizado.`);
    } catch (err) {
      setConfirm(false);
      setError(err instanceof ConsumeError ? err.message : "Não deu para lançar o consumo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate
      allow={["store"]}
      title="A fábrica não tem consumo interno"
      hint="Quem trabalha na fábrica retira 1 vez por dia em qualquer loja, com a senha pessoal."
    >
      <AppShell>
        <PageTitle
          title="Consumo interno"
          hint="Funcionário da loja retira aqui. Funcionário da fábrica também pode, uma vez por dia, em qualquer loja."
        />

        <Card className="mb-6 space-y-4">
          <p className="text-lg font-extrabold">Quem está consumindo?</p>
          {!users?.length ? (
            <Empty
              title="Ninguém habilitado nesta loja"
              hint="Peça para a administração cadastrar a equipe da loja ou os funcionários da fábrica."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {users.map((user) => (
                <Button
                  key={user.id}
                  type="button"
                  variant={login === user.login ? "secondary" : "ghost"}
                  className="h-auto min-h-16 flex-col items-start px-4 py-3"
                  onClick={() => {
                    setLogin(user.login);
                    setQty({});
                    setError("");
                  }}
                >
                  <span className="text-lg">{user.name}</span>
                  <span className="text-sm font-semibold opacity-70">
                    {isFactoryConsumeStaff(user.locationId) ? "Fábrica · 1× ao dia" : `ID ${user.login}`}
                  </span>
                </Button>
              ))}
            </div>
          )}
          {chosen && isFactoryConsumeStaff(chosen.locationId) ? (
            <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-900 ring-1 ring-orange-200">
              {factoryBlocked
                ? `${chosen.name} já retirou hoje${factoryToday?.[0] ? ` na ${consumePlaceName(factoryToday[0].locationId)}` : ""}. Só vale 1 vez por dia.`
                : `${chosen.name} é da fábrica. Pode retirar nesta loja agora. Depois disso, não retira de novo hoje em nenhuma loja.`}
            </p>
          ) : null}
          <Field label="Senha deste funcionário">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha pessoal"
              autoComplete="current-password"
            />
          </Field>
        </Card>

        {released.length === 0 ? (
          <Empty
            title="Nenhum produto liberado"
            hint="Peça para a administração liberar o que o time pode consumir."
          />
        ) : (
          <div className="space-y-3">
            {released.map((item) => (
              <Card key={item.niche.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold">{item.label}</p>
                  <p className="text-sm font-semibold text-stone-500">
                    Restam {item.remaining} de {item.allowance.dailyLimit} hoje nesta loja · {item.available} no estoque
                  </p>
                </div>
                <NumberStepper
                  value={qty[item.niche.id] ?? 0}
                  max={Math.min(item.remaining, item.available)}
                  onChange={(value) => setQty((current) => ({ ...current, [item.niche.id]: value }))}
                />
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6 space-y-4">
          <ErrorBox message={error} />
          <SuccessBox message={ok} />
          <Button disabled={selected.length === 0 || !login || !password || factoryBlocked} onClick={() => setConfirm(true)}>
            Confirmar consumo
          </Button>
        </Card>

        <ConfirmDialog
          open={confirm}
          title="Lançar consumo interno?"
          hint={`${chosen?.name ?? login} confirma com a senha. Isso baixa o estoque desta loja.`}
          confirmLabel="Confirmar"
          busy={saving}
          onConfirm={save}
          onCancel={() => setConfirm(false)}
        >
          <ul className="space-y-1 font-bold text-stone-800">
            {selected.map((item) => (
              <li key={item.niche.id}>
                {qty[item.niche.id]}× {item.label}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      </AppShell>
    </AccessGate>
  );
}
