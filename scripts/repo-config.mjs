export const DEFAULT_REPO = "Parcel-Protocol/utix";
export const LEGACY_REPOS = Object.freeze([
  "RevenantLabs/RevyHub",
  "RevenantLabs/RevyHubX",
]);

export function resolveRepository(raw = process.env.GH_REPO) {
  const selected = (raw || DEFAULT_REPO).trim();
  if (LEGACY_REPOS.includes(selected) || selected.toLowerCase().includes("revyhub")) {
    throw new Error(
      `[create-issues] Legacy repository "${selected}" is not allowed. Destination must be "${DEFAULT_REPO}" or configured via GH_REPO.`
    );
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(selected)) {
    throw new Error(
      `[create-issues] Invalid repository format: "${selected}". Expected "owner/repo".`
    );
  }
  return selected;
}
