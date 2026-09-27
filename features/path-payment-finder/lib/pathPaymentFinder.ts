import { Asset } from "@stellar/stellar-sdk";
import { err, ok, type Result } from "@/core/result/result";
import { horizonServer } from "@/core/horizon/client";
import type { StellarNetwork } from "@/core/network/types";
import { formatAssetDisplay, formatEffectiveRate } from "@/features/path-payment-finder/lib/format";
import { toPathPaymentFinderErrorCode } from "@/features/path-payment-finder/lib/pathPaymentFinder.errors";
import { validatePathPaymentFinderInput } from "@/features/path-payment-finder/schema";
import type {
  PathHop,
  PathPaymentFinderErrorCode,
  PathPaymentFinderInput,
  PathPaymentFinderResult,
  PaymentRoute
} from "@/features/path-payment-finder/types";

interface RawPathHop {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
}

interface RawPaymentPathRecord {
  source_amount: string;
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  destination_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  path: RawPathHop[];
}

export function toStellarAsset(code: string, issuer?: string): Asset {
  if (!code || code === "XLM" || code.toLowerCase() === "native" || !issuer) {
    return Asset.native();
  }
  return new Asset(code, issuer);
}

export function normalizePaymentRoute(raw: RawPaymentPathRecord): PaymentRoute {
  const pathHops: PathHop[] = Array.isArray(raw.path)
    ? raw.path.map((hop) => ({
        code: hop.asset_type === "native" ? "XLM" : (hop.asset_code || "UNKNOWN"),
        issuer: hop.asset_issuer,
        type: hop.asset_type || "credit_alphanum4"
      }))
    : [];

  const sourceAsset =
    raw.source_asset_type === "native"
      ? "XLM"
      : formatAssetDisplay(raw.source_asset_code || "UNKNOWN", raw.source_asset_issuer);

  const destinationAsset =
    raw.destination_asset_type === "native"
      ? "XLM"
      : formatAssetDisplay(raw.destination_asset_code || "UNKNOWN", raw.destination_asset_issuer);

  return {
    sourceAmount: raw.source_amount,
    sourceAsset,
    destinationAmount: raw.destination_amount,
    destinationAsset,
    path: pathHops,
    hopsCount: pathHops.length,
    effectiveRate: formatEffectiveRate(raw.source_amount, raw.destination_amount)
  };
}

export async function findPaymentPaths(
  input: PathPaymentFinderInput,
  network: StellarNetwork
): Promise<Result<PathPaymentFinderResult, PathPaymentFinderErrorCode>> {
  const validation = validatePathPaymentFinderInput(input);
  if (!validation.ok) {
    return err(validation.code);
  }

  const valid = validation.value;
  const sourceAsset = toStellarAsset(valid.sourceCode, valid.sourceIssuer);
  const destAsset = toStellarAsset(valid.destCode, valid.destIssuer);

  try {
    const server = horizonServer(network);

    let records: RawPaymentPathRecord[] = [];

    if (valid.mode === "strict-send") {
      const page = await server
        .strictSendPaths(sourceAsset, valid.amount, [destAsset])
        .call();
      records = (page.records || []) as unknown as RawPaymentPathRecord[];
    } else {
      const page = await server
        .strictReceivePaths([sourceAsset], destAsset, valid.amount)
        .call();
      records = (page.records || []) as unknown as RawPaymentPathRecord[];
    }

    const routes = records.map(normalizePaymentRoute);

    return ok({
      mode: valid.mode,
      sourceAsset: formatAssetDisplay(valid.sourceCode, valid.sourceIssuer),
      destAsset: formatAssetDisplay(valid.destCode, valid.destIssuer),
      amount: valid.amount,
      routes
    });
  } catch (error) {
    return err(toPathPaymentFinderErrorCode(error));
  }
}
