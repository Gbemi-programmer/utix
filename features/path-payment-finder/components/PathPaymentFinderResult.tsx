import { Card, CardHeader, CardTitle } from "@/core/ui/Card";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/path-payment-finder/copy";
import { formatHopBreadcrumbs } from "@/features/path-payment-finder/lib/format";
import type { PathPaymentFinderResult as ResultType } from "@/features/path-payment-finder/types";

interface Props {
  result: ResultType;
}

export function PathPaymentFinderResult({ result }: Props) {
  if (result.routes.length === 0) {
    return (
      <StatusMessage
        type="info"
        title={copy.noRoutesTitle}
        description={copy.noRoutesDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>{copy.resultTitle}</CardTitle>
            <span className="text-xs font-mono text-[#68758a]">
              {result.mode === "strict-send" ? "Strict Send" : "Strict Receive"}:{" "}
              <strong className="text-[#172033]">{result.amount}</strong>{" "}
              {result.mode === "strict-send" ? result.sourceAsset : result.destAsset}
            </span>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="table" aria-label={copy.resultTitle}>
            <thead className="border-b border-[#e3ebf5] bg-[#f8fafc] text-xs font-semibold text-[#68758a]">
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">{copy.sourceAmountHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.destAmountHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.hopsHeader}</th>
                <th scope="col" className="px-4 py-3">{copy.effectiveRateHeader}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3ebf5]">
              {result.routes.map((route, index) => (
                <tr key={index} className="hover:bg-white/80">
                  <td className="px-4 py-3 font-semibold text-[#68758a]">{index + 1}</td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-semibold text-[#172033]">{route.sourceAmount}</span>{" "}
                    <span className="text-xs text-[#8a98aa]">{route.sourceAsset}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-semibold text-[#172033]">{route.destinationAmount}</span>{" "}
                    <span className="text-xs text-[#8a98aa]">{route.destinationAsset}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {route.hopsCount === 0 ? (
                      <span className="inline-block rounded bg-[#f1f5f9] px-2 py-0.5 font-medium text-[#475569]">
                        {copy.directRoute}
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="inline-block rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                          {copy.hopsCount(route.hopsCount)}
                        </span>
                        <div className="font-mono text-[11px] text-[#68758a]">
                          {formatHopBreadcrumbs(route.path)}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-[#172033]">
                    {route.effectiveRate}
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
