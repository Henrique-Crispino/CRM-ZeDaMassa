import { getDb } from "./db";
import { getPanel } from "./locations";
import {
  PeopleError,
  personAllowedPanelIds,
  personCanUsePanel,
  personHomePanelId,
} from "./people";
import {
  clearOperatorSession,
  getActorId,
  setActorId,
  setLocationId,
} from "./session";
import type { Employee } from "./types";

export async function verifyOperatorPin(personId: string, pin: string) {
  const person = await getDb().employees.get(personId);
  if (!person?.active) throw new PeopleError("Escolha quem está operando.");
  const expected = person.password?.trim() ?? "";
  if (expected.length < 4) {
    throw new PeopleError("Esta ficha ainda não tem PIN. O Yokota cadastra na Equipe.");
  }
  if (pin.trim() !== expected) throw new PeopleError("PIN não confere.");
  return person;
}

export function enterOperator(person: Employee, panelId?: string) {
  const home = personHomePanelId(person);
  if (!home) throw new PeopleError("Esta pessoa não tem lugar neste sistema.");
  const panel = panelId && personCanUsePanel(person, panelId) ? panelId : home;
  setActorId(person.id);
  setLocationId(panel);
  return panel;
}

export function switchOperatorPanel(person: Employee, panelId: string) {
  if (!personCanUsePanel(person, panelId)) {
    throw new PeopleError(`Isto não é de ${person.name}.`);
  }
  setLocationId(panelId);
}

export function leaveOperator() {
  clearOperatorSession();
}

export function operatorHasSession() {
  return Boolean(getActorId());
}

export function panelLabel(panelId: string) {
  return getPanel(panelId)?.name ?? panelId;
}

export function otherOperatorPanels(person: Employee, currentId: string) {
  return personAllowedPanelIds(person).filter((id) => id !== currentId);
}
