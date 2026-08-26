import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const findings = [];
const shotDir = path.join(process.cwd(), "scripts", "audit-shots");

function record(name, pass, detail = "") {
  findings.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function chromePath() {
  return process.env.PLAYWRIGHT_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

function todayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + days);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
  } catch (error) {
    console.warn("screenshot fail", name, error instanceof Error ? error.message : error);
  }
}

async function waitShell(page) {
  await page.waitForFunction(
    () => /Onde você trabalha agora|Você está na/.test(document.body?.innerText || ""),
    { timeout: 45000 },
  );
}

async function waitMain(page, ms = 45000) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector("main");
        if (!main) return true;
        const text = (main.innerText || "").trim();
        return text.length > 0 && text !== "Carregando..." && !/Carregando o caixa|Carregando o movimento|Carregando os clientes/.test(text);
      },
      { timeout: ms },
    );
    return Date.now() - started;
  } catch {
    return -1;
  }
}

async function setPlace(page, id) {
  await page.evaluate((value) => localStorage.setItem("gp-location", value), id);
  await page.goto("http://localhost:3000/inicio", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  return waitMain(page);
}

async function mainText(page) {
  return page.locator("main").innerText();
}

async function clickDialog(page, name) {
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name }).click();
}

async function main() {
  mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
  const page = await desktop.newPage();
  page.setDefaultTimeout(40000);

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await setPlace(page, "store_1");

  await page.goto("http://localhost:3000/pedir", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 25000);
  const pedir = await mainText(page);
  record("Loja em Pedir vê só o estoque dela", /Nesta loja:/i.test(pedir), pedir.replace(/\s+/g, " ").slice(0, 180));
  record(
    "Loja em Pedir não vê a câmara",
    !/fábrica tem/i.test(pedir) && !/camara tem/i.test(pedir) && !/câmara tem/i.test(pedir),
    /fábrica tem|câmara tem|camara tem/i.test(pedir) ? pedir.replace(/\s+/g, " ").slice(0, 160) : "sem Y da câmara",
  );
  record("Pedir tem Reposição e Encomenda", /Reposição/.test(pedir) && /Encomenda/.test(pedir));
  await shot(page, "t9-01-pedir-loja");

  await page.getByRole("button", { name: /^Encomenda$/ }).click();
  await page.waitForTimeout(400);
  const festa = addDays(todayDate(), 5);
  await page.locator('input[type="date"]').first().fill(festa);
  await page.getByPlaceholder("Buscar: coxinha, festa, coca...").fill("mini");
  await page.waitForTimeout(400);
  const plus = page.getByRole("button", { name: "Aumentar" }).first();
  for (let i = 0; i < 5; i += 1) await plus.click();
  await page.getByPlaceholder("Ex.: aniversário da Márcia").fill("Aniversário da Márcia");
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: /^Pix$/ }).click();
  await shot(page, "t9-02-encomenda-montada");
  await page.getByRole("button", { name: /Revisar e enviar/ }).click({ timeout: 10000 });
  await clickDialog(page, /Confirmar pedido/);
  await page.waitForFunction(
    () => /Encomenda enviada|Pedido enviado|fábrica já foi avisada/i.test(document.body?.innerText || ""),
    { timeout: 20000 },
  );
  const afterAsk = await mainText(page);
  record(
    "Loja lança encomenda com data e sinal",
    /Encomenda enviada|fábrica já foi avisada/i.test(afterAsk),
    afterAsk.replace(/\s+/g, " ").slice(0, 180),
  );

  await page.evaluate(() => localStorage.setItem("gp-location", "factory"));
  await page.goto("http://localhost:3000/pedidos", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 25000);
  const fila = await mainText(page);
  record("Fábrica vê a encomenda na mesma fila", /Encomenda/i.test(fila) && /Loja Centro/i.test(fila), fila.replace(/\s+/g, " ").slice(0, 220));
  record("Fábrica vê a data da festa", /Para /.test(fila), fila.replace(/\s+/g, " ").match(/Para [^\n]+/)?.[0] ?? "");
  record(
    "Fábrica continua vendo o poço da câmara",
    /Câmara tem/i.test(fila),
    fila.replace(/\s+/g, " ").match(/Câmara tem[^\n]*/)?.[0] ?? "",
  );
  await shot(page, "t9-03-pedidos-fabrica");

  const mandar = page.locator("section").filter({ hasText: "Para " }).getByRole("button", { name: /Revisar e mandar/ }).first();
  if (await mandar.count()) {
    await mandar.click();
    await clickDialog(page, /Confirmar e mandar/);
    await page.waitForFunction(
      () => /Saiu da fábrica|romaneio/i.test(document.body?.innerText || ""),
      { timeout: 20000 },
    );
    record("Fábrica manda a encomenda", true, (await mainText(page)).replace(/\s+/g, " ").slice(0, 160));
  } else {
    record("Fábrica manda a encomenda", false, (await mainText(page)).replace(/\s+/g, " ").slice(0, 220));
  }
  await shot(page, "t9-04-mandou");

  await page.goto("http://localhost:3000/notificacoes", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const avisos = await mainText(page);
  record(
    "Sino da fábrica avisou a encomenda com o dia",
    /encomendou/i.test(avisos),
    avisos.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot(page, "t9-05-avisos");

  await page.goto("http://localhost:3000/producao", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const prod = await mainText(page);
  record("Produção tem De e Até visíveis", /\bDe\b/.test(prod) && /Até/.test(prod));
  record("Produção tem atalhos Hoje / Ontem / 7 dias", /Hoje/.test(prod) && /Ontem/.test(prod) && /7 dias/.test(prod));
  await shot(page, "t9-06-producao");

  await page.goto("http://localhost:3000/clientes", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  await page.getByText("Padaria do Zé").waitFor({ timeout: 15000 }).catch(() => {});
  const clientes = await mainText(page);
  record(
    "Ficha volume mostra os dias em que costuma pedir",
    /Padaria do Zé/i.test(clientes) && /Costuma pedir/i.test(clientes),
    clientes.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot(page, "t9-07-clientes");

  await page.evaluate(() => localStorage.setItem("gp-location", "store_1"));
  await page.goto("http://localhost:3000/receber", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  await page.getByRole("button", { name: /^Conferir$/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  const receber = page.getByRole("button", { name: /^Conferir$/ }).first();
  if (await receber.count()) {
    await receber.click();
    await page.getByRole("button", { name: /Confirmar: chegou tudo/ }).click();
    await clickDialog(page, /Confirmar recebimento/);
    await page.waitForFunction(
      () => /Conferido/i.test(document.body?.innerText || ""),
      { timeout: 20000 },
    );
    record("Loja confere o envio da festa", true, (await mainText(page)).replace(/\s+/g, " ").slice(0, 160));
  } else {
    record("Loja confere o envio da festa", false, (await mainText(page)).replace(/\s+/g, " ").slice(0, 180));
  }
  await shot(page, "t9-08-receber");

  await page.goto("http://localhost:3000/pedir", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const historico = page.locator("summary").filter({ hasText: /Pedidos já feitos/ });
  if (await historico.count()) {
    await historico.click();
    await page.waitForTimeout(400);
  }
  const entregar = page.getByRole("button", { name: /Resto e entregar/ }).first();
  if ((await entregar.count()) && (await entregar.isEnabled())) {
    await entregar.click();
    await page.getByRole("dialog").getByRole("button", { name: /^Pix$/ }).click();
    await clickDialog(page, /Confirmar entrega/);
    await page.waitForFunction(
      () => /Resto entrou|festa saiu|entregue/i.test(document.body?.innerText || ""),
      { timeout: 20000 },
    );
    record("Loja recebe o resto e entrega a festa", true, (await mainText(page)).replace(/\s+/g, " ").slice(0, 180));
  } else {
    record(
      "Loja recebe o resto e entrega a festa",
      false,
      (await mainText(page)).replace(/\s+/g, " ").slice(0, 220),
    );
  }
  await shot(page, "t9-09-entrega");

  await page.goto("http://localhost:3000/vender", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  record(
    "Vender não oferece canal Encomenda",
    (await page.getByRole("button", { name: /^Encomenda$/ }).count()) === 0,
  );
  record("Vender tem Fechar rápido", (await page.getByRole("button", { name: /Fechar rápido/ }).count()) > 0);
  const more = page.getByRole("button", { name: /Delivery nesta venda/ });
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(200);
  }
  const channelButtons = await page.locator("p").filter({ hasText: /^Como o cliente comprou/ }).locator("..").getByRole("button").allInnerTexts();
  record(
    "Mais nesta venda só mostra Delivery",
    channelButtons.some((label) => /Delivery/.test(label)) && channelButtons.every((label) => !/^Encomenda$/.test(label)),
    channelButtons.join(" · "),
  );
  await shot(page, "t9-10-vender");

  await page.goto("http://localhost:3000/caixa", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  await page.getByText("Sinal da festa").first().waitFor({ timeout: 15000 }).catch(() => {});
  const caixa = await mainText(page);
  record("Caixa do turno tem retirada produto+dinheiro", /Retirada/.test(caixa) && /não é venda/i.test(caixa));
  record("Turno lista o sinal da festa", /Sinal da festa/.test(caixa), caixa.replace(/\s+/g, " ").slice(0, 220));
  await shot(page, "t9-11-caixa");

  await page.evaluate(() => localStorage.setItem("gp-location", "admin"));
  await page.goto("http://localhost:3000/inicio", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 45000);
  const admin = await mainText(page);
  record(
    "Admin tem Saiu da câmara fora do Vendeu",
    /Saiu da câmara/.test(admin) && /não passou no caixa/i.test(admin),
    admin.replace(/\s+/g, " ").slice(0, 220),
  );
  await shot(page, "t9-12-admin");

  await page.goto("http://localhost:3000/relatorios", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const rel = await mainText(page);
  record("Relatórios tem o papel Compra na fábrica", /Compra na fábrica/.test(rel));
  await shot(page, "t9-13-relatorios");

  await browser.close();

  const passed = findings.filter((row) => row.pass).length;
  const failed = findings.filter((row) => !row.pass).length;
  const payload = { passed, failed, total: findings.length, findings };
  writeFileSync(path.join(process.cwd(), "scripts", "audit-t9-result.json"), JSON.stringify(payload, null, 2));
  console.log("\n--- RESUMO T9 ---");
  console.log(JSON.stringify({ passed, failed, total: findings.length }, null, 2));
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  writeFileSync(
    path.join(process.cwd(), "scripts", "audit-t9-result.json"),
    JSON.stringify({ crashed: String(error), findings }, null, 2),
  );
  process.exit(1);
});
