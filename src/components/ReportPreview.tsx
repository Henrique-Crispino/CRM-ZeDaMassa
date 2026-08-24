"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import type { ReportTable } from "@/lib/reports";

export function ReportPreview({
  report,
  onClose,
  closeLabel = "Fechar",
}: {
  report: ReportTable;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-900/40">
      <div className="flex min-h-0 flex-1 flex-col bg-orange-50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-white px-4 py-3 print:hidden">
          <div>
            <p className="text-xl font-extrabold text-stone-900">Prévia para imprimir</p>
            <p className="text-stone-600">Confira. Depois imprima ou salve como PDF na janela do computador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.print()}>
              <Printer className="size-5" />
              Imprimir
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {closeLabel}
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
                      <tr
                        key={`${row[0]}-${index}`}
                        className={index === report.rows.length - 1 && String(row[0]) === "TOTAL" ? "bg-stone-50 font-bold" : ""}
                      >
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
