"use client";

import { Button, Field, Input } from "@/components/ui";
import {
  clampToToday,
  datePresets,
  matchDatePreset,
  todayDate,
  type DatePresetId,
} from "@/lib/money";

const PRESET_LABEL: Record<Exclude<DatePresetId, "all">, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Últimos 7 dias",
  month: "Últimos 30 dias",
};

export function DateRangeFilter({
  from,
  to,
  onChange,
  presets = ["today", "yesterday", "week", "month"],
  allowEmpty = false,
  maxToday = true,
  fromHint,
  toHint,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  presets?: DatePresetId[];
  allowEmpty?: boolean;
  maxToday?: boolean;
  fromHint?: string;
  toHint?: string;
}) {
  const today = todayDate();
  const preset = matchDatePreset(from, to, today);
  const max = maxToday ? today : undefined;

  function applyFrom(value: string) {
    let next = maxToday ? clampToToday(value, today) : value;
    if (!allowEmpty && !next) next = today;
    let nextTo = to;
    if (next && nextTo && next > nextTo) nextTo = next;
    onChange(next, nextTo);
  }

  function applyTo(value: string) {
    let next = maxToday ? clampToToday(value, today) : value;
    if (!allowEmpty && !next) next = from || today;
    let nextFrom = from;
    if (next && nextFrom && next < nextFrom) nextFrom = next;
    onChange(nextFrom, next);
  }

  function applyPreset(id: DatePresetId) {
    if (id === "all") {
      onChange("", "");
      return;
    }
    const next = datePresets(today).find((item) => item.id === id);
    if (!next) return;
    onChange(next.from, next.to);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="De" hint={fromHint}>
          <Input type="date" max={max} value={from} onChange={(event) => applyFrom(event.target.value)} />
        </Field>
        <Field label="Até" hint={toHint}>
          <Input type="date" max={max} value={to} onChange={(event) => applyTo(event.target.value)} />
        </Field>
      </div>
      <p className="text-sm font-bold text-stone-700">Atalhos</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((id) => (
          <Button
            key={id}
            type="button"
            variant={preset === id ? "primary" : "ghost"}
            className="min-h-12"
            onClick={() => applyPreset(id)}
          >
            {id === "all" ? "Todos os dias" : PRESET_LABEL[id]}
          </Button>
        ))}
      </div>
    </div>
  );
}
