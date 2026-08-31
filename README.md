# Controle da Fábrica

Protótipo operacional de **fábrica de salgados + lojas**: produzir, guardar por lote e validade, mandar, vender com caixa aberto, baixar sobra e vencido, medir perda.

O nome da pasta (`CRM-gp`) é legado — **não é CRM**. É software sob medida para validar a **regra de negócio** da rede antes de ir para produção (back-end, auth, estoque único). Tudo roda **no navegador**, sem API.

## O que cobre

| Área | Exemplos |
|---|---|
| **Estoque** | Lote, validade, FIFO (pula vencido), inventário com 2ª contagem |
| **Fábrica** | Produzir, comprar, mandar para loja, cliente levou (volume), romaneio |
| **Loja** | Caixa (fundo, sangria, suprimento, quebra), vender, pedir reposição, receber envio |
| **Festa** | Encomenda com data, sinal no caixa, resto na entrega — **fora do balcão** |
| **Pessoas** | Porta com PIN, ficha única, testemunha na 2ª contagem, consumo interno |
| **Admin** | Visão da rede, relatórios CSV/impressão, pacote do dia |

Três fluxos que **não se misturam**: festa da loja (data + sinal) · reposição (`/pedir`) · volume da câmara (cliente pagou na fábrica).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Dexie** (IndexedDB `gp-salgados`) — 100 % client-side
- **Recharts** (gráficos do início admin/fábrica)

Sem servidor de dados. Cada navegador = seu próprio “banco” (limite consciente do protótipo).

## Começar

Requisitos: **Node.js 20+**, npm.

```bash
git clone https://github.com/Henrique-Crispino/CRM-ZeDaMassa.git
cd CRM-ZeDaMassa
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Na primeira visita o exemplo carrega sozinho (relativo ao dia de hoje).

Outros comandos:

```bash
npm run build    # build de produção
npm run start    # servir o build
npm run lint     # ESLint
```

## Demonstração rápida

Na **porta** (`/`), escolha quem opera e digite o PIN **`1234`** (texto puro — só protótipo).

| Ficha | Papel | Onde entra |
|---|---|---|
| **Matheus** | Dono | Administração · todos os painéis · **sem caixa** na ficha |
| **Yokota** | Gerente | Administração · todos os painéis · abre caixa de qualquer loja |
| **Telma** | Caixa | Loja Centro · não vê administração |
| **Brendão** | Fábrica | Fábrica · produz, manda, cliente levou |

Depois de entrar, use **Ir para outro lugar** (rodapé) para trocar entre Administração, Fábrica e lojas.

Lojas do exemplo: **Loja Centro** e **Loja Jardim**.

## Auditoria automática

Suite de fluxos que valida regra de negócio (caixa, FIFO, festa, poço, consumo, etc.):

```bash
npx tsx scripts/audit-flows.mts
```

**226/226 PASS** (31/08/2026) — ver [Auditoria QA 2026-08-26](docs/Auditoria%202026-08-26%20—%20QA%20do%20protótipo.md).

## Estrutura do código

```
src/
├── app/              # Rotas (loja, fábrica, admin, caixa, vender, pedir…)
├── components/       # UI, AppShell, dashboards, relatórios
└── lib/              # Regra de negócio (stock, cash, encomendas, seed…)
scripts/
└── audit-flows.mts   # Auditoria automatizada
docs/                 # Vault Obsidian — contexto, capítulos, QA, UI
```

Arquivos centrais da regra: `src/lib/stock.ts`, `cash.ts`, `encomendas.ts`, `requests.ts`, `factory-orders.ts`, `actor.ts`, `people.ts`.

## Documentação

A pasta `docs/` é o vault Obsidian do projeto: contexto, temporadas, capítulos de regra, auditorias e guias de UI. Pontos de entrada:

- [Contexto do produto](docs/Contexto%20do%20produto.md)
- [O que este repositório é](docs/O%20que%20este%20reposit%C3%B3rio%20%C3%A9.md)
- [Auditoria QA 2026-08-26](docs/Auditoria%202026-08-26%20—%20QA%20do%20protótipo.md)
- [Antes de produção](docs/Antes%20de%20produção.md) — o que fica de fora deste protótipo

## Status (31/08/2026)

- **Temporada 10** fechada no código (caps 50–56)
- **QA classe B** fechada: itens B-01 a B-14 resolvidos
- Pendente **classe A** (B-15): PIN em texto, DevTools, dois PCs — escopo de [Antes de produção](docs/Antes%20de%20produção.md)
- Próximo passo natural: **cliente validar no Chrome** (roteiro em `docs/`)

## Limitações conscientes

Este repositório **não** é produção:

- IndexedDB local — dois computadores = dois estoques
- PIN e senhas em texto; DevTools altera estado
- Sem NF-e, motoboy, delivery real, crédiário ou CRM completo
- “Delivery” na venda é **rótulo** de relatório, não operação de entrega

Não inventar back-end Postgres/API neste repo — produção é outro pedaço, documentado à parte.

## Licença

Projeto privado — uso interno da rede. Não é SaaS nem white-label.
