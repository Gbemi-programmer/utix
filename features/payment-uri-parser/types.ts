export type Sep7Operation = "pay" | "tx";

export type ParamStatus = "valid" | "warning" | "error" | "info";

export interface ParameterExplanation {
  key: string;
  value: string;
  label: string;
  description: string;
  status: ParamStatus;
  detail?: string;
}

export interface ParsedPaymentUri {
  rawUri: string;
  operation: Sep7Operation;
  operationLabel: string;
  isValid: boolean;
  summary: string;
  parameters: ParameterExplanation[];
  errors: string[];
  warnings: string[];
}

export interface PaymentUriParserInput {
  uri: string;
}

export type PaymentUriParserErrorCode =
  | "empty_input"
  | "invalid_scheme"
  | "unknown_operation"
  | "invalid_uri"
  | "secret_key_detected";
