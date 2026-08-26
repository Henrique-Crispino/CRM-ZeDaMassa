"use client";

import { Button, Field, Input } from "@/components/ui";
import type { Employee } from "@/lib/types";

export function WitnessFields({
  people,
  personId,
  pin,
  onPersonId,
  onPin,
}: {
  people: Employee[] | undefined;
  personId: string;
  pin: string;
  onPersonId: (id: string) => void;
  onPin: (value: string) => void;
}) {
  const picked = people?.find((person) => person.id === personId);

  if (people === undefined) {
    return <p className="font-semibold text-stone-600">Carregando a equipe...</p>;
  }

  if (people.length === 0) {
    return (
      <p className="font-extrabold text-red-700">
        Não tem outra pessoa na Equipe para conferir. Quem opera não confere o próprio número.
      </p>
    );
  }

  return (
    <>
      <Field
        label="Quem conferiu"
        hint="Outra ficha da Equipe. Quem está operando não confere o próprio número."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <Button
              key={person.id}
              type="button"
              variant={personId === person.id ? "secondary" : "ghost"}
              onClick={() => {
                onPersonId(person.id);
                onPin("");
              }}
            >
              {person.name}
            </Button>
          ))}
        </div>
      </Field>
      {picked ? (
        <Field label={`PIN de ${picked.name}`} hint="O PIN de quem conferiu. No exemplo é 1234. Não é o seu.">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(event) => onPin(event.target.value)}
            placeholder="PIN"
          />
        </Field>
      ) : null}
    </>
  );
}

export function witnessReady(personId: string, pin: string) {
  return personId.length > 0 && pin.trim().length >= 4;
}
