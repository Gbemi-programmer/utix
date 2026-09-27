"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/core/ui/Button";
import { Field } from "@/core/ui/Field";
import { Input, Select } from "@/core/ui/Input";
import { useNetwork } from "@/core/network/NetworkProvider";
import { copy } from "@/features/activity-timeline/copy";
import { TYPE_FILTERS } from "@/features/activity-timeline/schema";
import type { ActivityTimelineField, ActivityTypeFilter } from "@/features/activity-timeline/types";

export function ActivityTimelineForm({
  onSubmit,
  pending,
  errorField,
  errorMessage
}: {
  onSubmit: (accountId: string, typeFilter: ActivityTypeFilter) => void;
  pending: boolean;
  errorField?: ActivityTimelineField | null;
  errorMessage?: string | null;
}) {
  const [accountId, setAccountId] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>("all");
  const { label } = useNetwork();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(accountId, typeFilter);
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} noValidate className="space-y-4">
      <Field
        label={copy.formLabel}
        hint={`${copy.formHint} Reading ${label}.`}
        error={errorField === "accountId" ? errorMessage : null}
        required
      >
        {({ inputId, describedBy, invalid, required }) => (
          <Input
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            required={required}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder={copy.formPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        )}
      </Field>

      <Field label={copy.filterLabel} hint={copy.filterHint}>
        {({ inputId, describedBy }) => (
          <Select
            id={inputId}
            aria-describedby={describedBy}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ActivityTypeFilter)}
          >
            {TYPE_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {copy.typeFilterLabels[filter]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? copy.loading : copy.submit}
      </Button>
    </form>
  );
}
