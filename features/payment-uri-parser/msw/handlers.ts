import type { RequestHandler } from "msw";

/**
 * The payment URI parser is fully offline: parsing and parameter analysis are
 * conducted locally in the browser with no outbound network requests.
 */
export const handlers: RequestHandler[] = [];
