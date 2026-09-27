"use client";

import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { Field } from "@/core/ui/Field";
import { Input } from "@/core/ui/Input";
import { copy } from "@/features/payment-history/copy";

interface Props {
  onSubmit: (accountId: string) => void;
  pending: boolean;
}

export function PaymentHistoryForm({ onSubmit, pending }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label={copy.formLabel} hint={copy.formHint} required>
        {({ inputId, describedBy, invalid, required }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            required={required}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="G..."
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        )}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? copy.loading : copy.submit}
        </Button>
      </div>
    </form>
  );
}
