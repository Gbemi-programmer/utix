"use client";

import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { Field } from "@/core/ui/Field";
import { copy } from "@/features/payment-uri-parser/copy";
import type { PaymentUriParserInput } from "@/features/payment-uri-parser/types";

interface Props {
  onSubmit: (input: PaymentUriParserInput) => void;
  pending: boolean;
}

export function PaymentUriParserForm({ onSubmit, pending }: Props) {
  const [uri, setUri] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ uri });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label={copy.formLabel} hint={copy.formHint} required>
        {({ inputId, describedBy, invalid, required }) => (
          <textarea
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            required={required}
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder={copy.formPlaceholder}
            disabled={pending}
            rows={3}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-[#c7d6e8] bg-white/78 p-3 font-mono text-xs text-[#172033] outline-none transition placeholder:text-[#8a98aa] focus:border-[#47a8c7] focus:ring-2 focus:ring-[#8edcf4]/35 aria-[invalid=true]:border-[#ec5d55]"
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
