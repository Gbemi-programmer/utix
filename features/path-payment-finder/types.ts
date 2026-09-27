export type PathMode = "strict-send" | "strict-receive";

export interface PathHop {
  code: string;
  issuer?: string;
  type: string;
}

export interface PaymentRoute {
  sourceAmount: string;
  sourceAsset: string;
  destinationAmount: string;
  destinationAsset: string;
  path: PathHop[];
  hopsCount: number;
  effectiveRate: string;
}

export interface PathPaymentFinderInput {
  mode: PathMode;
  sourceCode: string;
  sourceIssuer?: string;
  destCode: string;
  destIssuer?: string;
  amount: string;
}

export interface PathPaymentFinderResult {
  mode: PathMode;
  sourceAsset: string;
  destAsset: string;
  amount: string;
  routes: PaymentRoute[];
}

export type PathPaymentFinderErrorCode =
  | "invalid_input"
  | "no_routes_found"
  | "rate_limited"
  | "request_failed";
