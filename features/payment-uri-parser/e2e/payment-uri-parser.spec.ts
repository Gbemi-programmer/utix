/**
 * End-to-end specification for the SEP-0007 Payment URI Parser tool.
 *
 * Documented as executable steps so the behaviour is reviewable even before a
 * browser runner is wired into CI.
 */
export const spec = {
  route: "/tools/payment-uri-parser",
  steps: [
    { action: "visit", target: "/tools/payment-uri-parser" },
    { action: "expect", target: "heading", value: "SEP-0007 Payment URI Parser" },
    { action: "click", target: "submit" },
    { action: "expect", target: "alert" }
  ]
} as const;
