"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ReportPreview } from "@/components/ReportPreview";
import { Button, Card, Empty, PageTitle } from "@/components/ui";
import { getLocation, getPanel, storeLocations } from "@/lib/locations";
import { addDays, todayDate } from "@/lib/money";
import {
  downloadCsv,
  fileName,
  orderedReportDates,
  reportCash,
  reportClosing,
  reportDayPack,
  reportInternal,
  reportInventory,
  reportProduction,
  reportFactoryClients,
  reportSales,
  reportStock,
  reportTransfers,
  reportWaste,
  reportWindow,
  type ReportTable,
  type StoreScope,
} from "@/lib/reports";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function RelatoriosPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const today = todayDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState<StoreScope>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReportTable | null>(null);

  const range = useMemo(() => orderedReportDates(from, to, today), [from, to, today]);
  const window = useMemo(() => reportWindow("range", range), [range]);
  const oneDay = window.fromDate === window.toDate;
  const storeLabel =
    scope === "all" ? "a rede" : scope === "factory" ? "a fábrica" : (getLocation(scope)?.name ?? scope);
  const packBadge = !oneDay
    ? "Intervalo · junta os dias"
    : window.fromDate === today
      ? "Hoje · uma folha"
      : window.fromDate === addDays(today, -1)
        ? "Ontem · uma folha"
        : "Um dia · uma folha";

  if (panel && panel.type !== "admin") {
    return (
      <AppShell>
        <Empty
          title="Relatórios só o admin baixa"
          hint="Loja e fábrica operam o dia. Quem tira o papel e o Excel é a administração."
        />
      </AppShell>
    );
  }

  async function run(
    id: string,
    action: "csv" | "print",
    builder: () => Promise<ReportTable>,
    prefix: string,
  ) {
    setError("");
    setBusy(`${id}-${action}`);
    try {
      const report = await builder();
      if (action === "csv") downloadCsv(fileName(prefix), report);
      else setPreview(report);
    } catch {
      setError("Não deu para gerar. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Relatórios"
        hint="De quando até quando, e o recorte: rede, fábrica ou uma loja. O pacote do dia junta caixa, envio, saídas e inventário numa folha. O resto é o detalhe."
      />

      <Card className="mb-6 space-y-5">
        <div>
          <p className="mb-1 text-base font-bold text-stone-800">De quando até quando</p>
          <p className="mb-3 text-sm text-stone-500">
            Vale para fechamento, vendas, perdas, envios, produção e consumo. Posição de estoque é foto agora — não usa essas datas.
          </p>
          <DateRangeFilter
            from={from}
            to={to}
            onChange={(nextFrom, nextTo) => {
              setFrom(nextFrom);
              setTo(nextTo);
            }}
          />
        </div>

        <div>
          <p className="mb-1 text-base font-bold text-stone-800">Qual recorte</p>
          <p className="mb-2 text-sm text-stone-500">
            Rede junta fábrica e lojas. Fábrica é a câmara (saída de cliente). Loja é só o balcão. Envios olham o destino, salvo na fábrica. Produção é sempre a fábrica.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={scope === "all" ? "primary" : "ghost"} className="min-h-12" onClick={() => setScope("all")}>
              Rede
            </Button>
            <Button type="button" variant={scope === "factory" ? "primary" : "ghost"} className="min-h-12" onClick={() => setScope("factory")}>
              Fábrica
            </Button>
            {storeLocations().map((store) => (
              <Button
                key={store.id}
                type="button"
                variant={scope === store.id ? "primary" : "ghost"}
                className="min-h-12"
                onClick={() => setScope(store.id)}
              >
                {store.name}
              </Button>
            ))}
          </div>
        </div>

        <p className="rounded-2xl bg-stone-100 px-4 py-3 text-base font-semibold text-stone-800">
          Estes papéis usam {window.label} · {storeLabel}
        </p>
        {error ? <p className="font-semibold text-red-700">{error}</p> : null}
      </Card>

      <Card className="mb-6 ring-2 ring-orange-300">
        <p className="text-xs font-extrabold uppercase tracking-wide text-orange-700">{packBadge}</p>
        <h2 className="mt-1 text-2xl font-extrabold text-stone-900">Pacote do dia</h2>
        <p className="mt-1 text-stone-600">
          Caixa (espécie, Pix, cartão, sangria, suprimento, quebra ou sobra), o que a fábrica mandou e a loja confirmou,
          vendeu / sobra / vencido / consumo. Se teve inventário, sistema × físico.
          {oneDay
            ? " Folha deste dia."
            : " Esta folha junta o intervalo. Para o fechamento de um dia, escolha Hoje ou Ontem."}
        </p>
        <p className="mt-2 text-sm font-semibold text-stone-500">Usa: {window.label} · {storeLabel}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={busy !== null} onClick={() => run("day", "print", () => reportDayPack(window, scope), "pacote-do-dia")}>
            <Printer className="size-5" />
            {busy === "day-print" ? "Montando..." : "Ver e imprimir"}
          </Button>
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => run("day", "csv", () => reportDayPack(window, scope), "pacote-do-dia")}>
            <Download className="size-5" />
            {busy === "day-csv" ? "Baixando..." : "Excel"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Conferência de caixa"
          hint="Fundo, espécie, Pix, cartão, sangria com destino (cofre ou depósito), suprimento, esperado, apurado e quebra ou sobra."
          uses="Período + loja"
          busy={busy}
          id="cash"
          onCsv={() => run("cash", "csv", () => reportCash(window, scope), "caixa")}
          onPrint={() => run("cash", "print", () => reportCash(window, scope), "caixa")}
        />
        <ReportCard
          title="Fechamento operacional"
          hint={`Cupons, custo do que vendeu, margem, ticket, sobra, vencido, consumo interno e taxa de perda de ${storeLabel}.`}
          uses="Período + loja"
          busy={busy}
          id="close"
          onCsv={() => run("close", "csv", () => reportClosing(window, scope), "fechamento")}
          onPrint={() => run("close", "print", () => reportClosing(window, scope), "fechamento")}
        />
        <ReportCard
          title="Vendas por produto"
          hint={`Unidades, preço médio, custo do que vendeu, margem e participação no faturamento de ${storeLabel}.`}
          uses="Período + loja"
          busy={busy}
          id="sales"
          onCsv={() => run("sales", "csv", () => reportSales(window, scope), "vendas")}
          onPrint={() => run("sales", "print", () => reportSales(window, scope), "vendas")}
        />
        <ReportCard
          title="Perdas, sobras e descartes"
          hint="Separa sobra do dia e lote vencido, com custo, venda perdida e peso no volume."
          uses="Período + loja"
          busy={busy}
          id="waste"
          onCsv={() => run("waste", "csv", () => reportWaste(window, scope), "perdas")}
          onPrint={() => run("waste", "print", () => reportWaste(window, scope), "perdas")}
        />
        <ReportCard
          title="Envios da fábrica"
          hint="O que saiu da câmara para cada loja, com validade do lote e custo de reposição."
          uses={scope === "all" ? "Período" : `Período · destino ${storeLabel}`}
          busy={busy}
          id="send"
          onCsv={() => run("send", "csv", () => reportTransfers(window, scope), "envios")}
          onPrint={() => run("send", "print", () => reportTransfers(window, scope), "envios")}
        />
        <ReportCard
          title="Produção da fábrica"
          hint="O recorte é o dia em que o lote foi feito, não o horário do lançamento."
          uses="Período · fábrica"
          busy={busy}
          id="prod"
          onCsv={() => run("prod", "csv", () => reportProduction(window), "producao")}
          onPrint={() => run("prod", "print", () => reportProduction(window), "producao")}
        />
        <ReportCard
          title="Compra na fábrica"
          hint="Cliente levou na câmara: unidades e custo do lote. Não passou no caixa. Não entra no faturamento da loja."
          uses="Período · fábrica"
          busy={busy}
          id="factory-clients"
          onCsv={() => run("factory-clients", "csv", () => reportFactoryClients(window), "compra-na-fabrica")}
          onPrint={() => run("factory-clients", "print", () => reportFactoryClients(window), "compra-na-fabrica")}
        />
        <ReportCard
          title="Consumo interno"
          hint="Quem retirou, em qual loja, se é da fábrica ou da loja, e o custo que saiu do estoque."
          uses="Período + loja"
          busy={busy}
          id="internal"
          onCsv={() => run("internal", "csv", () => reportInternal(window, scope), "consumo-interno")}
          onPrint={() => run("internal", "print", () => reportInternal(window, scope), "consumo-interno")}
        />
        <ReportCard
          title="Posição de estoque"
          hint="Foto agora: válidas, vencidas, mínimo, situação, valor a custo e valor se vender."
          uses={scope === "all" ? "Foto agora · fábrica e lojas" : `Foto agora · ${storeLabel}`}
          busy={busy}
          id="stock"
          onCsv={() => run("stock", "csv", () => reportStock(scope), "estoque")}
          onPrint={() => run("stock", "print", () => reportStock(scope), "estoque")}
        />
        <ReportCard
          title="Inventário e ajuste"
          hint="Sistema × físico × diferença, com motivo e quem contou. Não é venda nem sobra."
          uses="Período + local"
          busy={busy}
          id="inventory"
          onCsv={() => run("inventory", "csv", () => reportInventory(window, scope), "inventario")}
          onPrint={() => run("inventory", "print", () => reportInventory(window, scope), "inventario")}
        />
      </div>

      {preview ? <ReportPreview report={preview} onClose={() => setPreview(null)} closeLabel="Voltar aos relatórios" /> : null}
    </AppShell>
  );
}

function ReportCard({
  title,
  hint,
  uses,
  id,
  busy,
  onCsv,
  onPrint,
}: {
  title: string;
  hint: string;
  uses: string;
  id: string;
  busy: string | null;
  onCsv: () => void;
  onPrint: () => void;
}) {
  return (
    <Card>
      <p className="text-xs font-extrabold uppercase tracking-wide text-orange-700">{uses}</p>
      <h2 className="mt-1 text-xl font-extrabold text-stone-900">{title}</h2>
      <p className="mt-1 text-stone-600">{hint}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={onPrint}>
          <Printer className="size-5" />
          {busy === `${id}-print` ? "Montando..." : "Ver e imprimir"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={onCsv}>
          <Download className="size-5" />
          {busy === `${id}-csv` ? "Baixando..." : "Excel"}
        </Button>
      </div>
    </Card>
  );
}

