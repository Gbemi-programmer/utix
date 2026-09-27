/**
 * End-to-end specification for the Path Payment Route Finder tool.
 *
 * Documented as executable steps so the behaviour is reviewable even before a
 * browser runner is wired into CI.
 */
export const spec = {
  route: "/tools/path-payment-finder",
  steps: [
    { action: "visit", target: "/tools/path-payment-finder" },
    { action: "expect", target: "heading", value: "Path Payment Route Finder" },
    { action: "click", target: "submit" },
    { action: "expect", target: "alert" }
  ]
} as const;
