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

export type Period = "today" | "week" | "month";

export function periodRange(period: Period) {
  const to = endOfDayIso();
  if (period === "today") return { from: startOfDayIso(), to, days: 1 };
  const days = period === "week" ? 7 : 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const offset = start.getTimezoneOffset() * 60_000;
  const fromDate = new Date(start.getTime() - offset).toISOString().slice(0, 10);
  return { from: startOfDayIso(fromDate), to, days };
}

export function periodLabel(period: Period) {
  if (period === "today") return "hoje";
  if (period === "week") return "nos últimos 7 dias";
  return "nos últimos 30 dias";
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
