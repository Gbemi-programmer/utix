import { formatAmount } from "@/core/format/amount";
import { Card, CardHeader, CardTitle } from "@/core/ui/Card";
import { DataList } from "@/core/ui/DataList";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/liquidity-pool-calculator/copy";
import { formatBps } from "@/features/liquidity-pool-calculator/lib/format";
import type { LiquidityPoolCalculatorResult as ResultValue } from "@/features/liquidity-pool-calculator/types";

const amount = (value: string | undefined) => (value === undefined ? copy.notAvailable : formatAmount(value));

export function LiquidityPoolCalculatorResult({ result }: { result: ResultValue }) {
  return (
    <div className="space-y-4">
      {result.firstDeposit ? <StatusMessage type="info" title={copy.firstDeposit} description={result.detail} /> : null}
      {result.materiallyMovesPool ? <StatusMessage type="warning" title={copy.materialWarning} description={result.detail} /> : null}
      <Card>
        <CardHeader><CardTitle>{result.action === "deposit" ? copy.depositTitle : copy.withdrawTitle}</CardTitle></CardHeader>
        <DataList items={[
          { label: copy.reserveRatio, value: result.currentPrice?.display ?? copy.notAvailable, mono: true },
          { label: copy.priceLowerBound, value: result.priceLowerBound.display, mono: true },
          { label: copy.priceUpperBound, value: result.priceUpperBound.display, mono: true },
          { label: copy.fee, value: String(result.feeBp), mono: true },
          { label: copy.network, value: result.network }
        ]} />
      </Card>
      <Card>
        <DataList items={result.action === "deposit" ? [
          { label: copy.mintedShares, value: amount(result.mintedShares), mono: true },
          { label: copy.consumedA, value: amount(result.consumedA), mono: true },
          { label: copy.consumedB, value: amount(result.consumedB), mono: true },
          { label: copy.minimumA, value: amount(result.minimumA), mono: true },
          { label: copy.minimumB, value: amount(result.minimumB), mono: true },
          { label: copy.priceImpact, value: formatBps(result.priceImpactBps) }
        ] : [
          { label: copy.withdrawnA, value: amount(result.withdrawnA), mono: true },
          { label: copy.withdrawnB, value: amount(result.withdrawnB), mono: true },
          { label: copy.minimumA, value: amount(result.minimumA), mono: true },
          { label: copy.minimumB, value: amount(result.minimumB), mono: true }
        ]} />
        {!result.firstDeposit && !result.materiallyMovesPool ? <p className="mt-3 text-sm text-[#68758a]">{result.detail}</p> : null}
      </Card>
    </div>
  );
}
