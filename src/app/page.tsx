"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { showDemoHints } from "@/lib/demo-hints";
import { enterOperator, verifyOperatorPin } from "@/lib/operator";
import { listPeople, PeopleError, personDoorHint } from "@/lib/people";
import { useReady } from "@/lib/use-ready";

export default function HomePage() {
  const router = useRouter();
  const ready = useReady();
  const people = useLiveQuery(() => (ready ? listPeople() : undefined), [ready]);
  const active = (people ?? []).filter((person) => person.active);
  const [pickedId, setPickedId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const picked = active.find((person) => person.id === pickedId);

  async function enter() {
    if (!picked) {
      setError("Escolha quem está operando.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const person = await verifyOperatorPin(picked.id, pin);
      enterOperator(person);
      router.push("/inicio");
    } catch (err) {
      setError(err instanceof PeopleError ? err.message : "Não deu para entrar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-orange-50 px-4 py-10">
      <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <p className="text-sm font-bold uppercase tracking-wide text-orange-700">Controle da fábrica</p>
        <h1 className="mt-2 text-4xl font-extrabold leading-tight text-stone-900">Quem está operando?</h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-stone-600">
          Escolha o nome. Depois o PIN da ficha. Matheus e Yokota entram em qualquer painel. A Telma não abre a
          administração. Isto não é senha da empresa — é para não misturar o trabalho neste computador.
        </p>
        {!ready || people === undefined ? (
          <p className="mt-4 text-lg font-bold text-stone-500">Carregando...</p>
        ) : null}

        <div className="mt-8 space-y-3">
          {people !== undefined && active.length === 0 ? (
            <p className="text-lg font-semibold text-stone-600">Ninguém cadastrado na equipe.</p>
          ) : null}
          {active.map((person) => (
            <Button
              key={person.id}
              disabled={!ready}
              className="h-auto min-h-20 w-full flex-col items-start justify-center px-6 py-5 text-left"
              variant={pickedId === person.id ? "primary" : "ghost"}
              onClick={() => {
                setPickedId(person.id);
                setPin("");
                setError("");
              }}
            >
              <span className="text-2xl">{person.name}</span>
              <span className="mt-1 text-base font-semibold opacity-80">{personDoorHint(person)}</span>
            </Button>
          ))}
        </div>

        {picked ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void enter();
            }}
          >
            <Field
              label={`PIN de ${picked.name}`}
              hint={showDemoHints() ? "O mesmo da ficha. No exemplo é 1234." : "O mesmo cadastrado na Equipe."}
            >
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="PIN"
              />
            </Field>
            <ErrorBox message={error} />
            <Button type="submit" className="w-full" disabled={saving || pin.trim().length < 4}>
              {saving ? "Entrando..." : `Entrar como ${picked.name}`}
            </Button>
          </form>
        ) : null}
      </main>
    </div>
  );
}
