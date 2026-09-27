import { StrKey } from "@stellar/stellar-sdk";
import { err, ok, type Result } from "@/core/result/result";
import { formatParamLabel } from "@/features/payment-uri-parser/lib/format";
import { toPaymentUriParserErrorCode } from "@/features/payment-uri-parser/lib/paymentUriParser.errors";
import { validatePaymentUriInput } from "@/features/payment-uri-parser/schema";
import type {
  ParameterExplanation,
  ParsedPaymentUri,
  PaymentUriParserErrorCode,
  PaymentUriParserInput,
  Sep7Operation
} from "@/features/payment-uri-parser/types";

const KNOWN_PAY_PARAMS = new Set([
  "destination",
  "amount",
  "asset_code",
  "asset_issuer",
  "memo",
  "memo_type",
  "msg",
  "network_passphrase",
  "origin_domain",
  "signature",
  "callback"
]);

const KNOWN_TX_PARAMS = new Set([
  "xdr",
  "msg",
  "network_passphrase",
  "origin_domain",
  "signature",
  "callback"
]);

const DOMAIN_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function parseSep7Uri(
  input: PaymentUriParserInput
): Result<ParsedPaymentUri, PaymentUriParserErrorCode> {
  const validation = validatePaymentUriInput(input.uri);
  if (!validation.ok) {
    return err(validation.code);
  }

  const rawUri = validation.value.uri;

  try {
    const withoutScheme = rawUri.slice("web+stellar:".length);
    const qIdx = withoutScheme.indexOf("?");
    const operation = (qIdx >= 0 ? withoutScheme.slice(0, qIdx) : withoutScheme).toLowerCase() as Sep7Operation;
    const queryString = qIdx >= 0 ? withoutScheme.slice(qIdx + 1) : "";

    const searchParams = new URLSearchParams(queryString);
    const paramsList: Array<[string, string]> = [];
    for (const [k, v] of searchParams.entries()) {
      paramsList.push([k, v]);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const parameters: ParameterExplanation[] = [];

    const paramMap = new Map<string, string>();
    for (const [k, v] of paramsList) {
      paramMap.set(k, v);
    }

    if (operation === "pay") {
      // Validate pay mandatory fields
      if (!paramMap.has("destination") || !paramMap.get("destination")?.trim()) {
        errors.push("Missing required parameter: destination");
      }
    } else if (operation === "tx") {
      // Validate tx mandatory fields
      if (!paramMap.has("xdr") || !paramMap.get("xdr")?.trim()) {
        errors.push("Missing required parameter: xdr");
      }
    }

    // Inspect each param
    for (const [key, value] of paramsList) {
      let status: "valid" | "warning" | "error" | "info" = "valid";
      let description = "";
      let detail: string | undefined = undefined;

      const knownSet = operation === "pay" ? KNOWN_PAY_PARAMS : KNOWN_TX_PARAMS;
      if (!knownSet.has(key)) {
        status = "warning";
        description = "Unknown parameter not defined in SEP-0007 for this operation.";
        detail = "Standard Stellar wallets may ignore or reject this parameter.";
        warnings.push(`Unrecognized parameter '${key}'`);
        parameters.push({
          key,
          value,
          label: formatParamLabel(key),
          description,
          status,
          detail
        });
        continue;
      }

      if (key === "destination") {
        const isValid =
          StrKey.isValidEd25519PublicKey(value) || StrKey.isValidMed25519PublicKey(value);
        if (isValid) {
          description = "Recipient Stellar public account ID or muxed address.";
        } else {
          status = "error";
          description = "Invalid Stellar public account key.";
          detail = "Must be a valid 56-character Ed25519 public key (G...) or muxed address (M...).";
          errors.push("Invalid destination account ID.");
        }
      } else if (key === "amount") {
        const isValid = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(value) && Number(value) > 0;
        if (isValid) {
          description = "Requested payment amount.";
        } else {
          status = "error";
          description = "Invalid amount format.";
          detail = "Amount must be a positive decimal number with up to 7 decimal places.";
          errors.push("Invalid amount format.");
        }
      } else if (key === "asset_code") {
        const isValid = /^[A-Za-z0-9]{1,12}$/.test(value);
        if (isValid) {
          description = `Asset code (${value}). Native XLM if omitted.`;
        } else {
          status = "error";
          description = "Invalid asset code.";
          detail = "Asset codes must be 1 to 12 alphanumeric characters.";
          errors.push("Invalid asset code.");
        }
      } else if (key === "asset_issuer") {
        const isValid = StrKey.isValidEd25519PublicKey(value);
        if (isValid) {
          description = "Issuer account ID for non-native asset.";
        } else {
          status = "error";
          description = "Invalid asset issuer.";
          detail = "Must be a valid 56-character Stellar public key (G...).";
          errors.push("Invalid asset issuer account.");
        }
      } else if (key === "memo_type") {
        const validTypes = ["MEMO_TEXT", "MEMO_ID", "MEMO_HASH", "MEMO_RETURN"];
        if (validTypes.includes(value)) {
          description = `Transaction memo type: ${value}.`;
        } else {
          status = "error";
          description = "Invalid memo type.";
          detail = "Must be one of MEMO_TEXT, MEMO_ID, MEMO_HASH, or MEMO_RETURN.";
          errors.push("Invalid memo_type.");
        }
      } else if (key === "memo") {
        description = "Transaction memo payload.";
        const mType = paramMap.get("memo_type") || "MEMO_TEXT";
        if (mType === "MEMO_TEXT" && Buffer.byteLength(value, "utf8") > 28) {
          status = "error";
          detail = "MEMO_TEXT exceeds maximum 28 bytes limit.";
          errors.push("MEMO_TEXT exceeds 28 bytes limit.");
        } else if (mType === "MEMO_ID" && !/^\d+$/.test(value)) {
          status = "error";
          detail = "MEMO_ID must be an unsigned 64-bit integer.";
          errors.push("MEMO_ID must be a numeric ID.");
        }
      } else if (key === "xdr") {
        // Base64 check
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0;
        if (isBase64) {
          description = "Base64-encoded Stellar Transaction Envelope XDR.";
        } else {
          status = "error";
          description = "Invalid transaction XDR format.";
          detail = "Value must be a valid base64-encoded string.";
          errors.push("Invalid transaction envelope XDR.");
        }
      } else if (key === "msg") {
        description = "Human-readable message explaining the payment or transaction.";
      } else if (key === "origin_domain") {
        const isValid = DOMAIN_PATTERN.test(value);
        if (isValid) {
          description = "Domain name of the requesting entity (verified via stellar.toml).";
        } else {
          status = "warning";
          description = "Malformed domain name.";
          detail = "Should be a fully-qualified domain name.";
          warnings.push("Origin domain does not match standard domain format.");
        }
      } else if (key === "signature") {
        description = "Cryptographic signature produced by the origin domain.";
      } else if (key === "callback") {
        if (value.startsWith("url:")) {
          description = "Callback endpoint to notify once transaction is signed/submitted.";
        } else {
          status = "warning";
          description = "Non-standard callback format.";
          detail = "SEP-0007 specifies callbacks start with 'url:'.";
          warnings.push("Callback does not use the 'url:' prefix.");
        }
      } else if (key === "network_passphrase") {
        description = "Network passphrase specifying target network (e.g. Test SDF Network).";
      }

      parameters.push({
        key,
        value,
        label: formatParamLabel(key),
        description,
        status,
        detail
      });
    }

    // Additional cross-field checks:
    // If asset_code is provided and is not XLM, asset_issuer is required
    const assetCode = paramMap.get("asset_code");
    if (assetCode && assetCode.toUpperCase() !== "XLM" && !paramMap.get("asset_issuer")) {
      errors.push(`Missing 'asset_issuer' parameter required for non-native asset '${assetCode}'.`);
    }

    const isValid = errors.length === 0;
    const summary = isValid
      ? `Valid SEP-0007 ${operation.toUpperCase()} request with ${parameters.length} parameter(s).`
      : `Found ${errors.length} validation error(s) in SEP-0007 ${operation.toUpperCase()} request.`;

    return ok({
      rawUri,
      operation,
      operationLabel: operation === "pay" ? "Payment Request (pay)" : "Transaction Envelope (tx)",
      isValid,
      summary,
      parameters,
      errors,
      warnings
    });
  } catch (error) {
    return err(toPaymentUriParserErrorCode(error));
  }
}
