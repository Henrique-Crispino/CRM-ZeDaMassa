/** Dicas do seed (ex.: PIN 1234) — só em dev local, não na validação com cliente. */
export function showDemoHints() {
  return process.env.NODE_ENV === "development";
}
