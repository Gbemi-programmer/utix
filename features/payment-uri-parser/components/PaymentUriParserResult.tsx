import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/core/ui/Card";
import { CopyableValue } from "@/core/ui/CopyableValue";
import { copy } from "@/features/payment-uri-parser/copy";
import { getParamStatusBadgeClass } from "@/features/payment-uri-parser/lib/format";
import type { ParsedPaymentUri } from "@/features/payment-uri-parser/types";

interface Props {
  result: ParsedPaymentUri;
}

export function PaymentUriParserResult({ result }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>{copy.resultTitle}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-800">
                {result.operationLabel}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  result.isValid
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {result.isValid ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" /> {copy.validBadge}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" /> {copy.errorBadge}
                  </>
                )}
              </span>
            </div>
          </div>
        </CardHeader>

        <div className="px-6 py-3 border-b border-[#e3ebf5] bg-[#f8fafc] text-xs text-[#68758a]">
          <p>{result.summary}</p>
        </div>

        {result.errors.length > 0 && (
          <div className="mx-6 mt-4 rounded-md border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-4 w-4" />
              <span>Validation Errors:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="mx-6 mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              <span>Warnings:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-sm" role="table" aria-label={copy.resultTitle}>
            <thead className="border-b border-[#e3ebf5] bg-[#f8fafc] text-xs font-semibold text-[#68758a]">
              <tr>
                <th scope="col" className="px-4 py-3">{copy.paramKeyHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.paramValueHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.paramStatusHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.paramMeaningHeader}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3ebf5]">
              {result.parameters.map((param, index) => (
                <tr key={index} className="hover:bg-white/80">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-[#172033]">
                      {param.key}
                    </span>
                    <div className="text-[11px] text-[#8a98aa]">{param.label}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {param.value ? (
                      <CopyableValue
                        label={param.key}
                        value={param.value}
                        visible={Math.min(param.value.length, 16)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${getParamStatusBadgeClass(
                        param.status
                      )}`}
                    >
                      {param.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-[#172033]">{param.description}</div>
                    {param.detail && (
                      <div className="text-[11px] text-[#ec5d55] mt-0.5">{param.detail}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
