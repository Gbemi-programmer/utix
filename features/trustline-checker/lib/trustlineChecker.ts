import { err, ok, type Result } from "@/core/result/result";
import { horizonServer } from "@/core/horizon/client";
import { amountToStroops, stroopsToAmount } from "@/core/format/amount";
import type { StellarNetwork } from "@/core/network/types";
import { toTrustlineErrorCode } from "@/features/trustline-checker/lib/trustlineChecker.errors";
import type {
  TrustlineErrorCode,
  TrustlineInput,
  TrustlineResult
} from "@/features/trustline-checker/types";

interface CreditBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
  buying_liabilities?: string;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
}

/** Pure matcher, exported so the comparison rules can be tested directly. */
export function findTrustline(
  balances: CreditBalance[],
  assetCode: string,
  issuerId: string
): TrustlineResult {
  const credit = balances.filter(
    (balance) =>
      balance.asset_type !== "native" && balance.asset_type !== "liquidity_pool_shares"
  );

  // Asset codes are case-sensitive on the ledger, but users routinely type
  // "usdc". Compare case-insensitively and report the ledger's own casing.
  const match = credit.find(
    (balance) =>
      balance.asset_code?.toUpperCase() === assetCode.toUpperCase() &&
      balance.asset_issuer === issuerId
  );

  if (match) {
    const balance = match.balance;
    const limit = match.limit ?? "0";
    const buyingLiabilities = match.buying_liabilities ?? "0.0000000";
    const stroops = (value: string) => amountToStroops(value) ?? 0n;
    const remaining = stroops(limit) - stroops(balance) - stroops(buyingLiabilities);
    return {
      exists: true,
      assetCode: match.asset_code ?? assetCode,
      issuerId,
      balance,
      limit,
      buyingLiabilities,
      remainingReceivingCapacity: stroopsToAmount(remaining > 0n ? remaining : 0n),
      authorized: match.is_authorized !== false,
      authorizedToMaintainLiabilities: match.is_authorized_to_maintain_liabilities === true
    };
  }

  // A wrong issuer for the right code is the single most common mistake, so
  // surface the issuers this account actually trusts for that code.
  const otherIssuers = credit
    .filter((balance) => balance.asset_code?.toUpperCase() === assetCode.toUpperCase())
    .map((balance) => balance.asset_issuer)
    .filter((issuer): issuer is string => Boolean(issuer));

  return { exists: false, assetCode, issuerId, otherIssuers };
}

export async function checkTrustline(
  input: TrustlineInput,
  network: StellarNetwork
): Promise<Result<TrustlineResult, TrustlineErrorCode>> {
  try {
    const account = await horizonServer(network).loadAccount(input.accountId);
    return ok(
      findTrustline(account.balances as CreditBalance[], input.assetCode, input.issuerId)
    );
  } catch (error) {
    return err(toTrustlineErrorCode(error));
  }
}
