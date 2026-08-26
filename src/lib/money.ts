export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseMoney(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function todayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function formatDate(value: string) {
  const date = value.length === 10 ? `${value}T12:00:00` : value;
  return new Date(date).toLocaleDateString("pt-BR");
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function startOfDayIso(date = todayDate()) {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function endOfDayIso(date = todayDate()) {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + days);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export function daysUntil(date: string) {
  const today = new Date(`${todayDate()}T12:00:00`).getTime();
  const target = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

export type Period = "today" | "week" | "month";
export type DatePresetId = "today" | "yesterday" | "week" | "month" | "all";

export function datePresets(today = todayDate()) {
  return [
    { id: "today" as const, label: "Hoje", from: today, to: today },
    { id: "yesterday" as const, label: "Ontem", from: addDays(today, -1), to: addDays(today, -1) },
    { id: "week" as const, label: "Últimos 7 dias", from: addDays(today, -6), to: today },
    { id: "month" as const, label: "Últimos 30 dias", from: addDays(today, -29), to: today },
  ];
}

export function matchDatePreset(from: string, to: string, today = todayDate()): DatePresetId | "" {
  if (!from && !to) return "all";
  return datePresets(today).find((preset) => preset.from === from && preset.to === to)?.id ?? "";
}

export function clampToToday(value: string, today = todayDate()) {
  if (!value) return "";
  return value > today ? today : value;
}

export function orderedDates(from: string, to: string) {
  if (!from || !to) return { from, to };
  return from <= to ? { from, to } : { from: to, to: from };
}

export function eachDate(from: string, to: string) {
  const { from: start, to: end } = orderedDates(from, to);
  if (!start || !end) return [];
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    const next = addDays(cursor, 1);
    if (next === cursor) break;
    cursor = next;
  }
  return days;
}

export function dateRangeIso(fromDate: string, toDate: string) {
  const today = todayDate();
  const { from: start, to: end } = orderedDates(fromDate || today, toDate || today);
  const days = eachDate(start, end).length || 1;
  return {
    from: startOfDayIso(start),
    to: endOfDayIso(end),
    fromDate: start,
    toDate: end,
    days,
  };
}

export function periodRange(period: Period) {
  const today = todayDate();
  const preset = datePresets(today).find((item) => item.id === period) ?? datePresets(today)[0];
  const window = dateRangeIso(preset.from, preset.to);
  return { from: window.from, to: window.to, days: window.days };
}

export function periodLabel(period: Period) {
  if (period === "today") return "hoje";
  if (period === "week") return "nos últimos 7 dias";
  return "nos últimos 30 dias";
}

export function rangePhrase(from: string, to: string, today = todayDate()) {
  if (!from || !to) return "em todos os dias";
  const preset = matchDatePreset(from, to, today);
  if (preset === "today") return "hoje";
  if (preset === "yesterday") return "ontem";
  if (preset === "week") return "nos últimos 7 dias";
  if (preset === "month") return "nos últimos 30 dias";
  if (from === to) return formatDate(from);
  return `de ${formatDate(from)} até ${formatDate(to)}`;
}
