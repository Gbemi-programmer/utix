"use client";

import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { Field } from "@/core/ui/Field";
import { Input } from "@/core/ui/Input";
import { copy } from "@/features/path-payment-finder/copy";
import type { PathMode, PathPaymentFinderInput } from "@/features/path-payment-finder/types";

interface Props {
  onSubmit: (input: PathPaymentFinderInput) => void;
  pending: boolean;
}

export function PathPaymentFinderForm({ onSubmit, pending }: Props) {
  const [mode, setMode] = useState<PathMode>("strict-send");
  const [amount, setAmount] = useState("100");
  const [sourceCode, setSourceCode] = useState("XLM");
  const [sourceIssuer, setSourceIssuer] = useState("");
  const [destCode, setDestCode] = useState("USDC");
  const [destIssuer, setDestIssuer] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      mode,
      amount,
      sourceCode,
      sourceIssuer: sourceCode.toUpperCase() === "XLM" ? undefined : sourceIssuer,
      destCode,
      destIssuer: destCode.toUpperCase() === "XLM" ? undefined : destIssuer
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={copy.modeLabel} required>
          {({ inputId, describedBy }) => (
            <select
              id={inputId}
              aria-describedby={describedBy}
              value={mode}
              onChange={(e) => setMode(e.target.value as PathMode)}
              disabled={pending}
              className="w-full rounded-md border border-[#c7d6e8] bg-white px-3 py-2 text-sm text-[#172033] shadow-sm focus:border-[#7c65c1] focus:outline-none"
            >
              <option value="strict-send">{copy.strictSend}</option>
              <option value="strict-receive">{copy.strictReceive}</option>
            </select>
          )}
        </Field>

        <Field label={copy.amountLabel} hint={copy.amountHint} required>
          {({ inputId, describedBy, invalid, required }) => (
            <Input
              id={inputId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              required={required}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          )}
        </Field>
      </div>

      <div className="border-t border-[#e3ebf5] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#68758a]">
          {copy.sourceHeading}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label={copy.assetCodeLabel} required>
            {({ inputId, describedBy, invalid, required }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                required={required}
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                placeholder="XLM"
                disabled={pending}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <div className="md:col-span-2">
            <Field label={copy.assetIssuerLabel}>
              {({ inputId, describedBy, invalid }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={sourceIssuer}
                  onChange={(e) => setSourceIssuer(e.target.value)}
                  placeholder="G..."
                  disabled={pending || sourceCode.toUpperCase() === "XLM"}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              )}
            </Field>
          </div>
        </div>
      </div>

      <div className="border-t border-[#e3ebf5] pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#68758a]">
          {copy.destHeading}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label={copy.assetCodeLabel} required>
            {({ inputId, describedBy, invalid, required }) => (
              <Input
                id={inputId}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                required={required}
                value={destCode}
                onChange={(e) => setDestCode(e.target.value)}
                placeholder="USDC"
                disabled={pending}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <div className="md:col-span-2">
            <Field label={copy.assetIssuerLabel}>
              {({ inputId, describedBy, invalid }) => (
                <Input
                  id={inputId}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={destIssuer}
                  onChange={(e) => setDestIssuer(e.target.value)}
                  placeholder="G..."
                  disabled={pending || destCode.toUpperCase() === "XLM"}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              )}
            </Field>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? copy.loading : copy.submit}
        </Button>
      </div>
    </form>
  );
}
