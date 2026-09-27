"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/core/ui/Button";
import { Field } from "@/core/ui/Field";
import { Input } from "@/core/ui/Input";
import { useNetwork } from "@/core/network/NetworkProvider";
import { copy } from "@/features/contract-events/copy";
import type { RawContractEventsInput } from "@/features/contract-events/schema";

export function ContractEventsForm({
  onSubmit,
  pending
}: {
  onSubmit: (value: RawContractEventsInput) => void;
  pending: boolean;
}) {
  const [contractId, setContractId] = useState("");
  const [startLedger, setStartLedger] = useState("");
  const [endLedger, setEndLedger] = useState("");
  const { label } = useNetwork();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ contractId, startLedger, endLedger });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label={copy.contractLabel} hint={`${copy.contractHint} Reading ${label}.`} required>
        {({ inputId, describedBy, invalid, required }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            required={required}
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
            placeholder="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.startLabel} hint={copy.startHint}>
          {({ inputId, describedBy, invalid }) => (
            <Input
              id={inputId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={startLedger}
              onChange={(event) => setStartLedger(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="font-mono text-xs"
            />
          )}
        </Field>
        <Field label={copy.endLabel} hint={copy.endHint}>
          {({ inputId, describedBy, invalid }) => (
            <Input
              id={inputId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={endLedger}
              onChange={(event) => setEndLedger(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="font-mono text-xs"
            />
          )}
        </Field>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? copy.loading : copy.submit}
      </Button>
    </form>
  );
}
