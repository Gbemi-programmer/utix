import { formatDateTime } from "@/core/format/date";
import { copy } from "../copy";
export function formatValue(value:string|number|null): string {return value === null ? copy.unavailable : String(value);}
/** The observation time is shown in the user's locale; protocol values stay exact. */
export function formatField(field:string,value:string|number|null): string {return value !== null && field === "observedAt" ? formatDateTime(String(value)) : formatValue(value);}
