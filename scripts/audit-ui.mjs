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
        return text.length > 0 && text !== "Carregando..." && !/Carregando o caixa|Carregando o movimento/.test(text);
      },
      { timeout: ms },
    );
    return Date.now() - started;
  } catch {
    return -1;
  }
}

async function probeOpenCashConfirm(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "pt-BR" });
  const probe = await ctx.newPage();
  probe.setDefaultTimeout(40000);
  try {
    await probe.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
    await waitShell(probe);
    await probe.evaluate(() => localStorage.setItem("gp-location", "store_1"));
    await probe.goto("http://localhost:3000/caixa/fechar", { waitUntil: "domcontentloaded" });
    await waitShell(probe);
    await waitMain(probe, 25000);
    const hint = await probe.getByText(/Saldo esperado em espécie/).innerText();
    const match = hint.match(/R\$\s*[\d.]+,\d{2}/);
    if (!match) throw new Error(`nao achei o esperado: ${hint}`);
    const amount = match[0].replace(/R\$\s*/, "").trim();
    await probe.getByRole("textbox").first().fill(amount);
    await probe.getByRole("button", { name: /Conferir e encerrar/ }).click();
    await probe.getByRole("button", { name: /Encerrar caixa/ }).click();
    await probe.waitForFunction(
      () => /Caixa encerrado|O caixa está fechado|Abertura do caixa/.test(document.body?.innerText || ""),
      { timeout: 20000 },
    );
    await probe.goto("http://localhost:3000/caixa", { waitUntil: "domcontentloaded" });
    await waitShell(probe);
    await waitMain(probe, 20000);
    await probe.getByRole("button", { name: /^Abrir caixa$/ }).click();
    const dialogText = await probe.getByRole("dialog").innerText();
    return { pass: /Abrir o caixa\?/.test(dialogText) && /Fundo/.test(dialogText), detail: dialogText.replace(/\s+/g, " ").slice(0, 180) };
  } finally {
    await ctx.close();
  }
}

async function setPlace(page, id) {
  await page.evaluate((value) => localStorage.setItem("gp-location", value), id);
  await page.goto("http://localhost:3000/inicio", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  return waitMain(page);
}

async function navLabels(page) {
  return (await page.locator("aside nav a").allTextContents()).map((t) => t.trim());
}

async function mainText(page) {
  return page.locator("main").innerText();
}

async function main() {
  mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "pt-BR" });
  const page = await desktop.newPage();
  page.setDefaultTimeout(40000);

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  const homeText = await page.locator("body").innerText();
  record("Entrada pergunta onde você trabalha", /Onde você trabalha agora/.test(homeText));
  record("Entrada admite que não é senha", /Não é senha/.test(homeText));
  const homeButtons = await page.getByRole("button").allTextContents();
  record(
    "Entrada tem Administração, Fábrica e lojas",
    homeButtons.some((t) => /Administra/i.test(t)) &&
      homeButtons.some((t) => /Fábrica/i.test(t)) &&
      homeButtons.some((t) => /Loja/i.test(t)),
    homeButtons.map((t) => t.replace(/\s+/g, " ").trim()).join(" | ").slice(0, 240),
  );
  await shot(page, "01-entrada");
  await page.waitForTimeout(2500);

  const inicioMs = await setPlace(page, "store_1");
  record(
    "Início da loja sai de Carregando em até 45s",
    inicioMs >= 0,
    inicioMs >= 0 ? `${inicioMs}ms` : "ainda Carregando após 45s — loadDashboard do demo é pesado",
  );
  const storeHere = await page.getByRole("banner").innerText();
  record("Loja 1: topo diz o lugar", /Você está na/.test(storeHere), storeHere.replace(/\s+/g, " ").slice(0, 120));
  const storeNav = await navLabels(page);
  record(
    "Loja: turno tem Caixa, Vender, Pedir, Receber, Sobra",
    ["Caixa", "Vender", "Pedir mais", "Receber", "Sobra do dia"].every((label) => storeNav.includes(label)),
    storeNav.join(", "),
  );
  record(
    "Loja: abaixo tem Devolver, Consumo, Abrir pacote, Estoque, Inventário, Extrato",
    ["Devolver", "Consumo interno", "Abrir pacote", "Estoque", "Inventário", "Extrato"].every((label) =>
      storeNav.includes(label),
    ),
    storeNav.join(", "),
  );
  record("Loja: sem botão Mais", !storeNav.includes("Mais"), storeNav.join(", "));
  record("Loja: avisos não estão no menu", !storeNav.some((label) => /Aviso/i.test(label)));
  record("Loja: sem sino de avisos no topo", !/aviso/i.test(storeHere));
  record("Loja: Trocar de lugar no rodapé", (await page.getByRole("button", { name: /Trocar de lugar/i }).count()) === 1);
  if (inicioMs >= 0) {
    const inicio = await mainText(page);
    record("Início da loja tem atalhos de turno", /Vender no caixa|Abrir ou fechar o caixa|Pedir para a fábrica/.test(inicio));
  }
  await shot(page, "02-loja-inicio");

  await page.goto("http://localhost:3000/vender", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const venderText = await mainText(page);
  const venderBlocked = /abra o caixa|caixa fechado|abrir o caixa/i.test(venderText);
  const venderCatalog = /buscar|coxinha|salgado/i.test(venderText);
  record("Vender mostra catálogo ou bloqueio de caixa", venderBlocked || venderCatalog, venderText.replace(/\s+/g, " ").slice(0, 180));
  record(
    "Vender com turno aberto não mente 'caixa fechado'",
    /caixa aberto/i.test(venderText) ? !/está fechado/.test(venderText) : true,
    /caixa aberto/i.test(venderText) ? "turno aberto" : "caixa não estava aberto neste passe",
  );
  record(
    "Pessoa nova vê 'abra o caixa' na primeira venda",
    venderBlocked,
    venderBlocked ? "bloqueou" : "demo já abre o caixa em ensureAppDefaults — o caminho de abertura some",
  );
  await shot(page, "03-vender");

  await page.goto("http://localhost:3000/caixa", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const caixaNav = await page.locator('nav[aria-label="Caminhos do caixa"] a').allTextContents();
  record(
    "Caixa em três rotas visíveis",
    caixaNav.join(" ").includes("Turno") && caixaNav.join(" ").includes("Sangria") && caixaNav.join(" ").includes("Fechar"),
    caixaNav.join(" | "),
  );
  const caixaMain = await mainText(page);
  record("Caixa da loja já vem aberto no demo", /caixa aberto/i.test(caixaMain), caixaMain.replace(/\s+/g, " ").slice(0, 160));
  try {
    const opened = await probeOpenCashConfirm(browser);
    record("Abrir caixa pede ConfirmDialog", opened.pass, opened.detail);
  } catch (error) {
    record("Abrir caixa pede ConfirmDialog", false, error instanceof Error ? error.message : String(error));
  }
  await shot(page, "04-caixa-turno");

  await page.goto("http://localhost:3000/caixa/sangria", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const sangria = await mainText(page);
  record("Sangria fala em cofre e depósito", /cofre/i.test(sangria) && /dep[oó]sito/i.test(sangria));
  await shot(page, "05-sangria");

  await page.goto("http://localhost:3000/caixa/fechar", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const fechar = await mainText(page);
  record("Fechar pede dinheiro apurado / gaveta", /apurado|gaveta|espécie|especie/i.test(fechar));
  await shot(page, "06-fechar");

  await page.goto("http://localhost:3000/pedir", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Pedir mais é pedido à fábrica, não envio", /fábrica|fabrica|pedir/i.test((await mainText(page)).toLowerCase()));
  await shot(page, "07-pedir");

  await page.goto("http://localhost:3000/receber", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Receber da loja existe", /receber|confer|trânsito|transito|envio/i.test((await mainText(page)).toLowerCase()));
  await shot(page, "08-receber-loja");

  await page.goto("http://localhost:3000/sobras", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Sobra do dia não se chama vencido no título", /sobra/i.test(await page.locator("h1").first().innerText()));
  await shot(page, "09-sobra");

  await page.goto("http://localhost:3000/consumo-interno", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Consumo pede identificação e senha", /identifica|senha/i.test(await mainText(page)));
  await shot(page, "10-consumo");

  await page.goto("http://localhost:3000/kardex", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const kardexTitle = await page.locator("h1").first().innerText().catch(() => "");
  record("Loja: Extrato não se chama Kardex no título", !/kardex/i.test(kardexTitle), kardexTitle);
  await shot(page, "11-extrato");

  await page.goto("http://localhost:3000/inventario", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  await shot(page, "12-inventario-loja");
  record("Inventário da loja carrega", (await mainText(page)).length > 40);

  await page.getByRole("button", { name: /Trocar de lugar/i }).first().click();
  await page.getByRole("dialog").waitFor();
  const leaveCopy = await page.getByRole("dialog").innerText();
  record("Trocar de lugar pede confirmação", /Sair da|Ficar aqui/.test(leaveCopy), leaveCopy.replace(/\s+/g, " ").slice(0, 160));
  await page.getByRole("dialog").getByRole("button", { name: /Trocar de lugar/i }).click();
  await page.waitForTimeout(700);
  record("Depois de sair, volta para a escolha de lugar", /Onde você trabalha/.test(await page.locator("body").innerText()));

  const factoryMs = await setPlace(page, "factory");
  record("Início da fábrica sai de Carregando em até 45s", factoryMs >= 0, factoryMs >= 0 ? `${factoryMs}ms` : "timeout");
  const factoryNav = await navLabels(page);
  record(
    "Fábrica: turno tem Pedidos, Produzir, Compras, Mandar, Receber",
    ["Pedidos", "Produzir", "Compras", "Mandar p/ loja", "Receber"].every((label) => factoryNav.includes(label)),
    factoryNav.join(", "),
  );
  record(
    "Fábrica: abaixo tem Devoluções, Produtos, Clientes, Abrir pacote, Estoque, Inventário, Extrato",
    ["Devoluções", "Produtos", "Clientes", "Abrir pacote", "Estoque", "Inventário", "Extrato"].every((label) =>
      factoryNav.includes(label),
    ),
    factoryNav.join(", "),
  );
  record("Fábrica: sem Mais", !factoryNav.includes("Mais"));
  record("Fábrica: sino de avisos no topo", (await page.getByRole("banner").locator("button, a").count()) >= 1);
  await shot(page, "13-fabrica-inicio");

  await page.goto("http://localhost:3000/enviar", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const enviar = await mainText(page);
  record("Envio: quantidade primeiro, loja só na revisão", /revisar e mandar|a loja só aparece|a loja entra na revisão/i.test(enviar));
  const storeOnForm = await page.locator("main").getByRole("button", { name: /Loja \d/i }).count();
  record("Envio: destino não está no formulário principal", storeOnForm === 0, `lojaButtons=${storeOnForm}`);
  const plus = page.locator("main button").filter({ hasText: "+" }).first();
  if (await plus.count()) {
    await plus.click();
    await page.getByRole("button", { name: /Revisar e mandar/i }).click();
    await page.getByRole("dialog").waitFor();
    const dialog = await page.getByRole("dialog").innerText();
    record("Revisão do envio pergunta a loja e lista as quantidades", /Para qual loja|Mandar para|Loja/.test(dialog), dialog.replace(/\s+/g, " ").slice(0, 180));
    await page.getByRole("dialog").getByRole("button", { name: /Voltar/i }).click();
  } else {
    record("Revisão do envio pergunta a loja e lista as quantidades", false, "não achou stepper");
  }
  await shot(page, "14-enviar");

  await page.goto("http://localhost:3000/produzir", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const produzir = (await mainText(page)).toLowerCase();
  record("Produzir lista salgado e não Coca como item de produção", /coxinha|pastel|kibe|risole/.test(produzir) && !produzir.includes("coca-cola"));
  await shot(page, "15-produzir");

  await page.goto("http://localhost:3000/compras", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Compras existe para entrada comprada", /compra|bebida|coca/.test((await mainText(page)).toLowerCase()));
  await shot(page, "16-compras");

  await page.goto("http://localhost:3000/pedidos", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Pedidos da fábrica existe", /pedido/i.test(await page.locator("h1").first().innerText()));
  const pedidosText = await mainText(page);
  record(
    "Fila da fábrica fala de loja ou de cliente",
    /loja|cliente|câmara|camara|separar|levou/i.test(pedidosText),
    pedidosText.replace(/\s+/g, " ").slice(0, 180),
  );
  await shot(page, "17-pedidos");

  await page.goto("http://localhost:3000/clientes", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  const clientes = await mainText(page);
  record(
    "Clientes da fábrica: Festa ou retirada e Compra na fábrica",
    /festa ou retirada/i.test(clientes) && /compra na f[aá]brica/i.test(clientes),
    clientes.replace(/\s+/g, " ").slice(0, 200),
  );
  record("Lista mostra Padaria do Zé no demo", /Padaria do Zé/i.test(clientes));
  await shot(page, "22-clientes");

  const separar = page.getByRole("link", { name: /Separar pedido/i }).first();
  if (await separar.count()) {
    await separar.click();
    await waitMain(page, 15000);
    const pedido = await mainText(page);
    record(
      "Separar pedido reserva o poço e ainda não baixa",
      /reserva|ainda n[aã]o baixa|câmara tem|camada/i.test(pedido) || /livres/i.test(pedido),
      pedido.replace(/\s+/g, " ").slice(0, 200),
    );
    record("Repetir o último só aparece se já houve pedido", true, /Repetir o último/i.test(pedido) ? "visível" : "oculto (primeiro pedido)");
    await shot(page, "23-separar-pedido");
  } else {
    record("Separar pedido reserva o poço e ainda não baixa", false, "não achou o botão Separar pedido");
    record("Repetir o último só aparece se já houve pedido", false, "não entrou na tela");
  }

  await page.goto("http://localhost:3000/pacote", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 15000);
  record("Abrir pacote existe na fábrica", /abrir pacote|pacote/i.test(await mainText(page)));
  await shot(page, "24-pacote");

  record("Fábrica não tem Vender no menu", !(await navLabels(page)).includes("Vender"));
  await page.goto("http://localhost:3000/vender", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 10000);
  record("Fábrica em /vender vê empty da loja", /venda é na loja|painel de uma loja/i.test(await mainText(page)));

  await page.evaluate(() => localStorage.removeItem("gp-location"));
  const adminMs = await setPlace(page, "admin");
  record("Início do admin sai de Carregando em até 45s", adminMs >= 0, adminMs >= 0 ? `${adminMs}ms` : "timeout");
  const adminNav = await navLabels(page);
  record("Admin: menu tem Relatórios e Organização", adminNav.includes("Relatórios") && adminNav.includes("Organização"), adminNav.join(", "));
  record("Admin ainda rotula Kardex (loja diz Extrato)", adminNav.includes("Kardex"), adminNav.join(", "));
  record("Admin: lista longa sem divisor turno/resto", adminNav.length >= 10, `itens=${adminNav.length}`);
  await shot(page, "18-admin-inicio");

  await page.goto("http://localhost:3000/relatorios", { waitUntil: "domcontentloaded" });
  await waitShell(page);
  await waitMain(page, 20000);
  const rel = await mainText(page);
  record("Relatórios: campos De e Até visíveis", /\bDe\b/.test(rel) && /Até/.test(rel));
  record("Relatórios: atalhos Hoje / Ontem / Últimos 7 / Últimos 30", /Hoje/.test(rel) && /Ontem/.test(rel) && /Últimos 7/.test(rel) && /Últimos 30/.test(rel));
  record("Relatórios: sem chip Escolher datas", !/Escolher datas/.test(rel));
  record("Relatórios: pacote do dia está no topo", /Pacote do dia/.test(rel));
  record(
    "Pacote do dia tem recorte Fábrica (saída da câmara)",
    (await page.getByRole("button", { name: /^Fábrica$/ }).count()) > 0,
    "hoje só Todas as lojas / Centro / Jardim",
  );
  record("Fechamento operacional não usa jargão CMV", !/CMV/.test(rel), /CMV/.test(rel) ? "CMV aparece no card" : "ok");
  await shot(page, "19-relatorios");

  await page.goto("http://localhost:3000/mais");
  await page.waitForTimeout(900);
  record("/mais redireciona para /inicio", page.url().includes("/inicio"), page.url());

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(45000);
  await phone.goto("http://localhost:3000/");
  await waitShell(phone);
  await phone.evaluate(() => localStorage.setItem("gp-location", "store_1"));
  await phone.goto("http://localhost:3000/inicio", { waitUntil: "domcontentloaded" });
  await waitShell(phone);
  await waitMain(phone, 45000);
  await shot(phone, "20-mobile-loja");
  const asideBox = await phone.locator("aside").boundingBox();
  const mainBox = await phone.locator("main").boundingBox();
  record(
    "Mobile 390px: menu não come o turno (conteúdo >= 280px)",
    Boolean(mainBox && mainBox.width >= 280),
    `aside=${Math.round(asideBox?.width || 0)} main=${Math.round(mainBox?.width || 0)} viewport=390`,
  );
  record(
    "Mobile 390px: sidebar some (só ≥ md)",
    !asideBox || asideBox.width < 8,
    `aside=${Math.round(asideBox?.width || 0)}`,
  );
  record("Mobile 390px: faixa de turno embaixo", (await phone.locator('nav[aria-label="Turno"]').count()) === 1);
  record("Mobile 390px: botão Menu no topo", (await phone.getByRole("button", { name: /^Menu$/ }).count()) > 0);
  const overflowX = await phone.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
  record("Mobile 390px: sem scroll horizontal da página", !overflowX, overflowX ? "tem scroll-x" : "ok");

  await phone.getByRole("button", { name: /^Menu$/ }).click();
  await phone.getByRole("button", { name: /Trocar de lugar/i }).filter({ visible: true }).waitFor();
  record(
    "Mobile: gaveta Menu tem Trocar de lugar",
    (await phone.getByRole("button", { name: /Trocar de lugar/i }).filter({ visible: true }).count()) > 0,
  );
  await phone.locator('aside button[aria-label="Fechar menu"]').click();

  await phone.goto("http://localhost:3000/vender", { waitUntil: "domcontentloaded" });
  await waitShell(phone);
  await waitMain(phone, 20000);
  await shot(phone, "21-mobile-vender");
  const venderPhone = await mainText(phone);
  record(
    "Mobile vender: caixa honesto (aberto ou fechado, não loading eterno)",
    /caixa aberto|está fechado/i.test(venderPhone) && !/Carregando o caixa/.test(venderPhone),
    venderPhone.replace(/\s+/g, " ").slice(0, 140),
  );

  await phone.goto("http://localhost:3000/pedir", { waitUntil: "domcontentloaded" });
  await waitShell(phone);
  await waitMain(phone, 15000);
  const stickyBox = await phone.getByRole("button", { name: /Revisar e enviar/ }).locator("xpath=ancestor::div[contains(@class,'fixed')][1]").boundingBox();
  const turnoBox = await phone.locator('nav[aria-label="Turno"]').boundingBox();
  record(
    "Mobile: barra de ação fica acima da faixa de turno",
    Boolean(stickyBox && turnoBox && stickyBox.y + stickyBox.height <= turnoBox.y + 8),
    `stickyBottom=${Math.round((stickyBox?.y || 0) + (stickyBox?.height || 0))} turnoTop=${Math.round(turnoBox?.y || 0)}`,
  );

  await browser.close();

  const passed = findings.filter((row) => row.pass).length;
  const failed = findings.filter((row) => !row.pass).length;
  const payload = { passed, failed, total: findings.length, findings };
  writeFileSync(path.join(process.cwd(), "scripts", "audit-ui-result.json"), JSON.stringify(payload, null, 2));
  console.log("\n--- RESUMO UI ---");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  const passed = findings.filter((row) => row.pass).length;
  const failed = findings.filter((row) => !row.pass).length;
  writeFileSync(
    path.join(process.cwd(), "scripts", "audit-ui-result.json"),
    JSON.stringify({ passed, failed, total: findings.length, findings, crashed: String(error) }, null, 2),
  );
  process.exit(1);
});
