import { err, ok, type Result } from "@/core/result/result";
import { parseAmount, stroopsToAmount, type AmountParseError } from "@/core/format/amount";
import type { AmountConverterErrorCode, AmountConverterResult } from "@/features/amount-converter/types";

export const MAX_STROOPS = 9_223_372_036_854_775_807n;
export const MAX_AMOUNT = "922337203685.4775807";

const STROOPS_INTEGER = /^\d+$/;

const AMOUNT_ERRORS: Record<AmountParseError, AmountConverterErrorCode> = {
  empty: "empty_input",
  grouping_separator: "grouping_separator",
  invalid_format: "invalid_amount",
  too_many_decimals: "too_many_decimals",
  negative: "negative_not_allowed",
  out_of_range: "out_of_range"
};

function outOfRange(): Result<never, AmountConverterErrorCode> {
  return err("out_of_range");
}

function validateStroopsRange(stroops: bigint): Result<bigint, AmountConverterErrorCode> {
  if (stroops < 0n) return err("negative_not_allowed");
  if (stroops > MAX_STROOPS) return outOfRange();
  return ok(stroops);
}

/** Converts a stroop string into the paired display amount. */
export function convertFromStroops(raw: string): Result<AmountConverterResult, AmountConverterErrorCode> {
  const value = raw.trim();
  if (!value) return err("empty_input");
  if (value.startsWith("-")) return err("negative_not_allowed");
  if (!STROOPS_INTEGER.test(value)) return err("invalid_amount");

  let stroops: bigint;
  try {
    stroops = BigInt(value);
  } catch {
    return err("invalid_amount");
  }

  const range = validateStroopsRange(stroops);
  if (!range.ok) return range;

  return ok({
    stroops: stroops.toString(),
    amount: stroopsToAmount(stroops)
  });
}

/** Converts a seven-decimal display amount into the paired stroop string. */
export function convertFromAmount(raw: string): Result<AmountConverterResult, AmountConverterErrorCode> {
  const parsed = parseAmount(raw);
  if (!parsed.ok) return err(AMOUNT_ERRORS[parsed.code]);

  return ok({
    stroops: parsed.value.toString(),
    amount: stroopsToAmount(parsed.value)
  });
}

/** Loads the int64 maximum as a canonical conversion example. */
export function maxStroopExample(): AmountConverterResult {
  return {
    stroops: MAX_STROOPS.toString(),
    amount: MAX_AMOUNT
  };
}
