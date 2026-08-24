"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, Field, Input, PageTitle } from "@/components/ui";
import { getLocation, getPanel, storeLocations } from "@/lib/locations";
import { addDays, todayDate } from "@/lib/money";
import {
  downloadCsv,
  fileName,
  reportCash,
  reportClosing,
  reportInternal,
  reportProduction,
  reportSales,
  reportStock,
  reportTransfers,
  reportWaste,
  reportWindow,
  type ReportTable,
  type StoreScope,
  type WhenKind,
} from "@/lib/reports";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function RelatoriosPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const [when, setWhen] = useState<WhenKind>("today");
  const [from, setFrom] = useState(addDays(todayDate(), -6));
  const [to, setTo] = useState(todayDate());
  const [scope, setScope] = useState<StoreScope>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReportTable | null>(null);

  const window = useMemo(() => reportWindow(when, { from, to }), [when, from, to]);
  const storeLabel = scope === "all" ? "toda a rede" : getLocation(scope)?.name ?? scope;

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
        hint="Um recorte só: quando e onde. Depois escolha o papel. Estoque é foto agora; o resto usa o período."
      />

      <Card className="mb-6 space-y-5">
        <div>
          <p className="mb-1 text-base font-bold text-stone-800">1. Quando</p>
          <p className="mb-2 text-sm text-stone-500">Vale para fechamento, vendas, perdas, envios, produção e consumo.</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Hoje"],
                ["week", "7 dias"],
                ["month", "30 dias"],
                ["range", "Escolher datas"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                variant={when === id ? "primary" : "ghost"}
                className="min-h-12"
                onClick={() => setWhen(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {when === "range" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="De">
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </Field>
              <Field label="Até">
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </Field>
            </div>
          ) : null}
          <p className="mt-2 text-sm font-semibold text-stone-600">Recorte: {window.label}</p>
        </div>

        <div>
          <p className="mb-1 text-base font-bold text-stone-800">2. Onde</p>
          <p className="mb-2 text-sm text-stone-500">
            Filtra loja em fechamento, vendas, perdas e consumo. Envios usam a loja de destino. Produção é sempre a fábrica.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={scope === "all" ? "primary" : "ghost"} className="min-h-12" onClick={() => setScope("all")}>
              Rede
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
        {error ? <p className="font-semibold text-red-700">{error}</p> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Conferência de caixa"
          hint="Fundo, espécie, Pix, cartão, sangria, suprimento, saldo esperado, dinheiro apurado e quebra ou sobra."
          uses="Período + loja"
          busy={busy}
          id="cash"
          onCsv={() => run("cash", "csv", () => reportCash(window, scope), "caixa")}
          onPrint={() => run("cash", "print", () => reportCash(window, scope), "caixa")}
        />
        <ReportCard
          title="Fechamento operacional"
          hint={`Cupons, CMV, margem, ticket, sobra, vencido, consumo interno e taxa de perda de ${storeLabel}.`}
          uses="Período + loja"
          busy={busy}
          id="close"
          onCsv={() => run("close", "csv", () => reportClosing(window, scope), "fechamento")}
          onPrint={() => run("close", "print", () => reportClosing(window, scope), "fechamento")}
        />
        <ReportCard
          title="Vendas por produto"
          hint={`Unidades, preço médio, CMV, margem e participação no faturamento de ${storeLabel}.`}
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
          hint="Entrada no estoque da fábrica: data do lote, lançamento, quantidade e validade."
          uses="Período · fábrica"
          busy={busy}
          id="prod"
          onCsv={() => run("prod", "csv", () => reportProduction(window), "producao")}
          onPrint={() => run("prod", "print", () => reportProduction(window), "producao")}
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
      </div>

      {preview ? <ReportPreview report={preview} onClose={() => setPreview(null)} /> : null}
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

function ReportPreview({ report, onClose }: { report: ReportTable; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-900/40">
      <div className="flex min-h-0 flex-1 flex-col bg-orange-50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-white px-4 py-3 print:hidden">
          <div>
            <p className="text-xl font-extrabold text-stone-900">Prévia para imprimir</p>
            <p className="text-stone-600">Confira os números. Depois imprima ou salve como PDF na janela do computador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.print()}>
              <Printer className="size-5" />
              Imprimir
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Voltar aos relatórios
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <article id="report-print" className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
            <h1 className="text-2xl font-extrabold text-stone-900">{report.title}</h1>
            <p className="mt-1 text-stone-600">{report.subtitle}</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {report.headers.map((header) => (
                      <th key={header} className="border border-stone-200 bg-orange-50 px-3 py-2 font-bold text-stone-800">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td className="border border-stone-200 px-3 py-4 text-stone-500" colSpan={report.headers.length}>
                        Nada neste recorte.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row, index) => (
                      <tr key={`${row[0]}-${index}`} className={index === report.rows.length - 1 && String(row[0]) === "TOTAL" ? "bg-stone-50 font-bold" : ""}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${index}-${cellIndex}`} className="border border-stone-200 px-3 py-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {report.notes?.map((note) => (
              <p key={note} className="mt-4 text-stone-600">
                {note}
              </p>
            ))}
            <p className="mt-4 text-sm text-stone-500">Gerado em {new Date().toLocaleString("pt-BR")}</p>
          </article>
        </div>
      </div>
    </div>
  );
}
