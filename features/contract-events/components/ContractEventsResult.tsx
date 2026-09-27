import { Badge } from "@/core/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/core/ui/Card";
import { CopyableValue } from "@/core/ui/CopyableValue";
import { DataList } from "@/core/ui/DataList";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/contract-events/copy";
import {
  eventName,
  formatInteger,
  formatLedgerRange,
  formatTimestamp
} from "@/features/contract-events/lib/format";
import type {
  ContractEvent,
  ContractEventsResult as Result,
  DecodedScVal
} from "@/features/contract-events/types";

function ScValLine({ value }: { value: DecodedScVal }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-2">
      <span className="shrink-0 rounded bg-[#eef3fa] px-1.5 py-0.5 font-mono text-[11px] text-[#4e5c73]">
        {value.type}
      </span>
      <code className="min-w-0 break-all font-mono text-xs text-[#172033]">{value.display}</code>
      {value.decoded ? null : <span className="text-xs text-[#9f342d]">{copy.undecoded}</span>}
    </div>
  );
}

function EventItem({ event, index }: { event: ContractEvent; index: number }) {
  const name = eventName(event.topics);

  return (
    <li className="space-y-3 rounded-md border border-[#e3ebf5] bg-white/60 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-[#68758a]">#{index + 1}</span>
        <span className="font-semibold text-[#172033]">{name ?? event.type}</span>
        <Badge tone="muted">{event.type}</Badge>
        {event.inSuccessfulContractCall ? null : <Badge tone="warning">{copy.failedCall}</Badge>}
        <span className="text-xs text-[#68758a]">
          Ledger {formatInteger(event.ledger)} · {formatTimestamp(event.ledgerClosedAt)}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-bold text-[#4e5c73]">{copy.topicsLabel}</p>
        {event.topics.map((topic, topicIndex) => (
          <ScValLine key={topicIndex} value={topic} />
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-bold text-[#4e5c73]">{copy.valueLabel}</p>
        <ScValLine value={event.value} />
      </div>

      {event.txHash ? (
        <CopyableValue label={`transaction hash for event ${index + 1}`} value={event.txHash} visible={8} />
      ) : null}
    </li>
  );
}

export function ContractEventsResult({ result }: { result: Result }) {
  const summary = [
    {
      label: "Contract",
      value: <CopyableValue label="contract ID" value={result.contractId} visible={8} />
    },
    {
      label: copy.rangeLabel,
      value: formatLedgerRange(result.startLedger, result.endLedger, copy.openEnded),
      mono: true
    },
    { label: copy.latestLedgerLabel, value: formatInteger(result.latestLedger), mono: true },
    { label: copy.eventsTitle, value: formatInteger(result.events.length) }
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.summaryTitle}</CardTitle>
        </CardHeader>
        <DataList items={summary} />
      </Card>

      {result.truncated ? <StatusMessage type="warning" title={copy.truncated} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.eventsTitle}</CardTitle>
        </CardHeader>
        {result.events.length ? (
          <ol aria-label={copy.eventsTitle} className="space-y-2">
            {result.events.map((event, index) => (
              <EventItem key={event.id} event={event} index={index} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[#68758a]">{copy.noEvents}</p>
        )}
      </Card>
    </div>
  );
}
