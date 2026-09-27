import type { PathHop } from "@/features/path-payment-finder/types";

export function formatAssetDisplay(code: string, issuer?: string): string {
  if (!code || code === "XLM" || code.toLowerCase() === "native") return "XLM";
  if (!issuer) return code;
  const shortIssuer = issuer.length > 8 ? `${issuer.slice(0, 4)}…${issuer.slice(-4)}` : issuer;
  return `${code} (${shortIssuer})`;
}

export function formatEffectiveRate(sourceAmount: string, destAmount: string): string {
  const src = Number(sourceAmount);
  const dst = Number(destAmount);
  if (!src || !dst || Number.isNaN(src) || Number.isNaN(dst)) return "—";

  const rate = dst / src;
  if (rate >= 1000) {
    return rate.toFixed(2);
  }
  if (rate >= 0.0001) {
    return rate.toFixed(4);
  }
  return rate.toFixed(7);
}

export function formatHopBreadcrumbs(path: PathHop[]): string {
  if (!path || path.length === 0) return "Direct";
  return path.map((hop) => hop.code).join(" → ");
}
