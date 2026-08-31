# Controle da Fábrica

**Protótipo full-stack no browser** para operação de fábrica de salgados + lojas — estoque por lote, caixa, envio, venda e encomenda de festa.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

> Repositório legado `CRM-gp` · **não é CRM**. Software sob medida para validar **regra de negócio** antes de produção (API, auth, estoque centralizado).

---

## Sobre o projeto

Sistema pensado para o dia a dia de uma rede real: a **câmara** produz e manda, a **loja** vende com caixa aberto, o **admin** enxerga a rede. Tudo com regras explícitas — FIFO que pula vencido, pedido que reserva estoque, festa com sinal separada do balcão.

**Destaques técnicos:**

- App Router (Next.js 16) com UI responsiva (desktop + telefone)
- Persistência **100 % client-side** com Dexie (IndexedDB)
- Domínio rico em TypeScript: caixa, estoque, encomendas, volume da fábrica
- Suite de auditoria automatizada (**226 cenários**)

---

## Funcionalidades

| Módulo | O que faz |
|--------|-----------|
| **Estoque** | Lote, validade, FIFO, inventário com 2ª contagem + testemunha |
| **Fábrica** | Produzir, comprar, enviar, romaneio, cliente levou (volume) |
| **Loja** | Caixa, vender, pedir reposição, receber envio, sobra do dia |
| **Festa** | Encomenda com data, sinal e resto na entrega — fora do `/vender` |
| **Pessoas** | Porta com PIN, ficha única, consumo interno, carimbo de quem operou |
| **Admin** | Dashboard, relatórios CSV/impressão, pacote do dia |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Lucide |
| Linguagem | TypeScript 5 |
| Dados | Dexie 4 + IndexedDB (`gp-salgados`) |
| Gráficos | Recharts 3 |
| Qualidade | ESLint 9, script de auditoria (`tsx`) |

**Arquitetura:** sem API REST nem banco remoto neste protótipo. Cada navegador mantém seu próprio IndexedDB (útil para demo; limitação consciente para produção).

---

## Pré-requisitos

| Requisito | Versão |
|-----------|--------|
| **Node.js** | 20 LTS ou superior |
| **npm** | 10+ (vem com Node) |
| **Navegador** | Chrome ou Edge (recomendado para IndexedDB) |

Opcional: [Git](https://git-scm.com/) para clonar o repositório.

---

## Como rodar

### 1. Clonar e instalar

```bash
git clone https://github.com/Henrique-Crispino/CRM-ZeDaMassa.git
cd CRM-ZeDaMassa
npm install
```

### 2. Ambiente de desenvolvimento

```bash
npm run dev
```

Abra **http://localhost:3000**. Na primeira visita, o seed de demonstração carrega automaticamente (dados relativos ao dia atual).

### 3. Build de produção (local)

```bash
npm run build
npm run start
```

A aplicação sobe em **http://localhost:3000** servindo o build otimizado.

---

## Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com hot reload |
| `npm run build` | Gera build de produção |
| `npm run start` | Sobe o build (requer `build` antes) |
| `npm run lint` | ESLint no projeto |
| `npx tsx scripts/audit-flows.mts` | Auditoria automatizada de regras de negócio |

---

## Demonstração (credenciais de exemplo)

Na tela inicial (`/`), escolha quem opera e use o PIN **`1234`**.

| Personagem | Papel | Acesso |
|------------|-------|--------|
| **Matheus** | Dono | Admin · todos os painéis · sem caixa na ficha |
| **Yokota** | Gerente | Admin · todos os painéis · abre caixa em qualquer loja |
| **Telma** | Operadora de caixa | Loja Centro |
| **Brendão** | Fábrica | Produção, envio, cliente levou |

**Fluxo sugerido para testar:**

1. Entrar como **Telma** → abrir caixa → vender
2. Trocar para **Brendão** (rodapé: *Ir para outro lugar*) → produzir → mandar para loja
3. Voltar à loja → **Receber** → conferir envio
4. Entrar como **Yokota** na admin → ver dashboard e relatórios

Lojas do exemplo: **Loja Centro** e **Loja Jardim**.

---

## Estrutura do projeto

```
├── src/
│   ├── app/                 # Rotas Next.js (loja, fábrica, admin, caixa…)
│   ├── components/          # UI, AppShell, dashboards
│   └── lib/                 # Regra de negócio
│       ├── stock.ts         # Estoque, venda, produção, inventário
│       ├── cash.ts            # Caixa, sangria, fechamento
│       ├── encomendas.ts      # Festa, sinal, entrega
│       ├── requests.ts        # Pedido da loja / poço
│       ├── factory-orders.ts  # Volume da câmara
│       ├── actor.ts           # Quem opera, testemunha
│       └── seed.ts            # Dados de demonstração
└── scripts/
    └── audit-flows.mts       # 226 testes de fluxo
```

---

## Testes e qualidade

Auditoria de fluxos críticos (caixa, FIFO, festa, consumo, identidade):

```bash
npx tsx scripts/audit-flows.mts
```

Resultado esperado: **233/233 PASS** (lib) e **71/71 PASS** (UI no Chrome).

---

## Status do protótipo

- Temporada 10 fechada no código (identidade, trilha, festa fora do balcão)
- QA classe **B** fechada (B-01 a B-14)
- Pendente classe **A** (B-15): PIN em texto, DevTools, multi-dispositivo → escopo de produção

---

## Limitações (protótipo)

Este repositório **valida regra**, não substitui ERP em produção:

- IndexedDB local — dois PCs = dois estoques
- PIN e senhas em texto plano
- Sem NF-e, motoboy real, delivery operacional ou crediário
- “Delivery” na venda é **rótulo** de relatório, não logística

Roadmap de produção (API, auth, estoque único) fica fora deste protótipo.

---

## Documentação

O vault Obsidian (`docs/`) fica **só na máquina de quem desenvolve** — não está no GitHub. Contexto de produto, capítulos de regra, auditorias e guias de UI vivem aí localmente.

---

## Licença

Projeto privado — uso interno da rede. Não é SaaS nem white-label.

---

<p align="center">
  Desenvolvido como protótipo de propósito · Next.js + TypeScript + Dexie
</p>
