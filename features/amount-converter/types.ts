export type AmountConverterField = "stroops" | "amount";

export type AmountConverterErrorCode =
  | "empty_input"
  | "invalid_amount"
  | "grouping_separator"
  | "too_many_decimals"
  | "out_of_range"
  | "negative_not_allowed";

export interface AmountConverterResult {
  stroops: string;
  amount: string;
}
