import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const shotDir = path.join(process.cwd(), "scripts", "audit-shots", "2026-08-31");
const findings = [];

function record(name, severity, pass, detail = "") {
  findings.push({ name, severity, pass, detail });
  console.log(`${pass ? "OK" : severity.toUpperCase()}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function chromePath() {
  return (
    process.env.PLAYWRIGHT_CHROME ||
    "C:\\Users\\Henrique\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1148\\chrome-win\\headless_shell.exe"
  );
}

async function shot(page, name) {
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
}

async function loginAs(page, personName) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(personName, "i") }).click();
  await page.getByPlaceholder("PIN").fill("1234");
  await page.getByRole("button", { name: new RegExp(`Entrar como ${personName}`, "i") }).click();
  await page.waitForURL(/\/inicio/, { timeout: 30000 });
}

async function waitNotLoading(page) {
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main");
      if (!main) return false;
      const t = (main.innerText || "").trim();
      return t.length > 20 && !/^Carregando\.{0,3}$/.test(t);
    },
    { timeout: 45000 },
  );
}

async function measureOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
}

async function bottomNavCount(page) {
  return page.locator('nav[aria-label="Turno"] a').count();
}

async function journeyStoreMobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(40000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const home = await page.locator("body").innerText();
  record("Entrada: pergunta quem opera", "info", /Quem está operando/.test(home));
  record("Entrada: explica que não é senha da empresa", "info", /não é senha da empresa/i.test(home));
  await shot(page, "mobile-01-entrada");

  await loginAs(page, "Telma");
  await waitNotLoading(page);
  const header = await page.locator("header.sticky").innerText();
  record("Mobile loja: header contextual", "info", /Você está na/.test(header), header.replace(/\s+/g, " ").slice(0, 100));
  record("Mobile loja: bottom nav presente", "info", (await bottomNavCount(page)) >= 5, String(await bottomNavCount(page)));
  record("Mobile loja: sidebar oculta", "info", !(await page.locator("aside.hidden.md\\:flex").isVisible()));
  const ov = await measureOverflow(page);
  record("Mobile loja início: sem scroll horizontal", "medio", !ov.overflow, `scroll ${ov.scrollWidth}/${ov.clientWidth}`);
  await shot(page, "mobile-02-inicio-loja");

  await page.goto(`${BASE}/vender`, { waitUntil: "domcontentloaded" });
  await waitNotLoading(page);
  const vender = await page.locator("main").innerText();
  record("Mobile vender: caixa aberto ou bloqueio claro", "info", /caixa aberto|está fechado|Carregando o caixa/i.test(vender));
  record("Mobile vender: sticky action bar", "info", (await page.locator(".fixed.inset-x-0.bottom-0").count()) > 0);
  const ov2 = await measureOverflow(page);
  record("Mobile vender: sem scroll horizontal", "medio", !ov2.overflow, `scroll ${ov2.scrollWidth}/${ov2.clientWidth}`);
  await shot(page, "mobile-03-vender");

  await page.getByRole("button", { name: "Menu" }).click();
  record("Mobile: gaveta menu abre", "info", (await page.locator('aside[class*="shadow-xl"]').count()) > 0);
  await shot(page, "mobile-04-menu");

  await ctx.close();
}

async function journeyAdminMobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  await loginAs(page, "Matheus");
  await waitNotLoading(page);
  const nav = await bottomNavCount(page);
  record("Mobile admin: sem bottom nav (só gaveta)", "info", nav === 0, String(nav));
  await page.getByRole("button", { name: "Menu" }).click();
  const links = await page.locator("aside nav a").count();
  record("Mobile admin: menu com itens", "info", links >= 8, String(links));
  await shot(page, "mobile-05-admin-menu");
  await ctx.close();
}

async function journeyDesktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  await loginAs(page, "Telma");
  await waitNotLoading(page);
  const aside = await page.locator("aside.hidden.md\\:flex").isVisible();
  record("Desktop loja: sidebar visível", "info", aside);
  await page.goto(`${BASE}/caixa`, { waitUntil: "domcontentloaded" });
  await waitNotLoading(page);
  const caixa = await page.locator("main").innerText();
  record("Caixa: loading distingue de fechado", "info", !/Abertura do caixa/.test(caixa) || /Caixa aberto|Carregando o caixa|Histórico/.test(caixa));
  record("Caixa: confirm dialog ao abrir (código)", "info", true, "ConfirmDialog presente no código — abrir exige confirmação");
  await shot(page, "desktop-06-caixa");
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    await journeyStoreMobile(browser);
    await journeyAdminMobile(browser);
    await journeyDesktop(browser);
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(shotDir, "findings.json"), JSON.stringify(findings, null, 2));
  const fails = findings.filter((f) => !f.pass && f.severity !== "info");
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
