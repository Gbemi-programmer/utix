"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/core/ui/Button";
import { tryCopyText } from "@/core/lib/clipboard";
import { truncateMiddle } from "@/core/lib/strings";
import { cn } from "@/core/lib/cn";

export interface CopyableValueProps {
  label: string;
  value: string;
  visible?: number;
  /** Show the whole value instead of a middle-truncated preview. */
  full?: boolean;
  className?: string;
}

export function CopyableValue({
  label,
  value,
  visible = 6,
  full = false,
  className
}: CopyableValueProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const outcome = await tryCopyText(value);
    if (timer.current) clearTimeout(timer.current);
    if (outcome === "copied") {
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 1600);
    } else {
      // Keep the recovery hint up until the next attempt so it can be read.
      setState("failed");
    }
  }, [value]);

  return (
    <span className={cn("inline-flex max-w-full items-center gap-2", className)}>
      <span title={value} className="min-w-0 truncate font-mono text-xs">
        {full ? value : truncateMiddle(value, visible)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="shrink-0"
        aria-label={`Copy ${label}`}
      >
        {state === "copied" ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        {state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `${label} copied to clipboard` : ""}
      </span>
      {state === "failed" ? (
        <span role="alert" className="text-xs text-muted-foreground">
          Could not copy {label}. Select it and press Ctrl+C (⌘C on Mac):{" "}
          <span className="select-all break-all font-mono" data-testid="copy-fallback-value">
            {value}
          </span>
        </span>
      ) : null}
    </span>
  );
}
