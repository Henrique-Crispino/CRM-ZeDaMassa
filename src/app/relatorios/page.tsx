"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Empty, Field, Input, PageTitle } from "@/components/ui";
import { getPanel, storeLocations } from "@/lib/locations";
import { periodLabel, todayDate, type Period } from "@/lib/money";
import {
  downloadCsv,
  fileName,
  reportClosing,
  reportSales,
  reportStock,
  reportTransfers,
  reportWaste,
  type ReportTable,
  type StoreScope,
} from "@/lib/reports";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

export default function RelatoriosPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const [period, setPeriod] = useState<Period>("today");
  const [scope, setScope] = useState<StoreScope>("all");
  const [date, setDate] = useState(todayDate());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReportTable | null>(null);

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
    builder: () => Promise<Parameters<typeof downloadCsv>[1]>,
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

  const storeLabel = scope === "all" ? "todas as lojas" : scope === "store_1" ? "Loja 1" : "Loja 2";

  return (
    <AppShell>
      <PageTitle
        title="Relatórios"
        hint="Só o admin baixa. Escolha o período e a loja, depois imprima ou salve no Excel."
      />

      <Card className="mb-6 space-y-4">
        <div>
          <p className="mb-2 text-base font-bold text-stone-800">Período (vendas, perdas e envios)</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Hoje"],
                ["week", "7 dias"],
                ["month", "30 dias"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                variant={period === id ? "primary" : "ghost"}
                className="min-h-12"
                onClick={() => setPeriod(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-base font-bold text-stone-800">Loja</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={scope === "all" ? "primary" : "ghost"} className="min-h-12" onClick={() => setScope("all")}>
              Todas
            </Button>
            {storeLocations().map((store) => (
              <Button
                key={store.id}
                type="button"
                variant={scope === store.id ? "primary" : "ghost"}
                className="min-h-12"
                onClick={() => setScope(store.id as StoreScope)}
              >
                {store.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="max-w-xs">
          <Field label="Data do fechamento" hint="Só vale para o papel do dia.">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>
        {error ? <p className="font-semibold text-red-700">{error}</p> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Fechamento do dia"
          hint={`Vendas, lucro, pagamento e sobra de ${storeLabel} no dia escolhido.`}
          busy={busy}
          id="close"
          onCsv={() => run("close", "csv", () => reportClosing(date, scope), "fechamento")}
          onPrint={() => run("close", "print", () => reportClosing(date, scope), "fechamento")}
        />
        <ReportCard
          title="Vendas do período"
          hint={`O que cada produto vendeu ${periodLabel(period)}, em ${storeLabel}.`}
          busy={busy}
          id="sales"
          onCsv={() => run("sales", "csv", () => reportSales(period, scope), "vendas")}
          onPrint={() => run("sales", "print", () => reportSales(period, scope), "vendas")}
        />
        <ReportCard
          title="Perdas e sobras"
          hint={`Unidades e reais (custo e o que deixou de vender) ${periodLabel(period)}.`}
          busy={busy}
          id="waste"
          onCsv={() => run("waste", "csv", () => reportWaste(period, scope), "perdas")}
          onPrint={() => run("waste", "print", () => reportWaste(period, scope), "perdas")}
        />
        <ReportCard
          title="Envios da fábrica"
          hint={`O que saiu da fábrica para cada loja ${periodLabel(period)}. A loja não entra neste recorte.`}
          busy={busy}
          id="send"
          onCsv={() => run("send", "csv", () => reportTransfers(period), "envios")}
          onPrint={() => run("send", "print", () => reportTransfers(period), "envios")}
        />
        <ReportCard
          title="Estoque agora"
          hint="Foto da fábrica e das duas lojas, com o mínimo ao lado."
          busy={busy}
          id="stock"
          onCsv={() => run("stock", "csv", () => reportStock(), "estoque")}
          onPrint={() => run("stock", "print", () => reportStock(), "estoque")}
        />
      </div>

      {preview ? <ReportPreview report={preview} onClose={() => setPreview(null)} /> : null}
    </AppShell>
  );
}

function ReportCard({
  title,
  hint,
  id,
  busy,
  onCsv,
  onPrint,
}: {
  title: string;
  hint: string;
  id: string;
  busy: string | null;
  onCsv: () => void;
  onPrint: () => void;
}) {
  return (
    <Card>
      <h2 className="text-xl font-extrabold text-stone-900">{title}</h2>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-white px-4 py-3">
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
              Voltar
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <article id="report-print" className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
            <h1 className="text-2xl font-extrabold text-stone-900">{report.title}</h1>
            <p className="mt-1 text-stone-600">{report.subtitle}</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
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
                        Nada neste período.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row, index) => (
                      <tr key={`${row[0]}-${index}`}>
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
