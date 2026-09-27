/**
 * Active GrantFox publication target for Utix.
 *
 * Keep this small and explicit so a campaign change cannot silently publish
 * issues with a previous campaign's labels or attach them to the wrong UUID.
 */
export const grantfoxConfig = Object.freeze({
  projectId: "16987fb9-18ec-4555-acd9-dbf2c8ec9074",
  repositoryId: "1302133299",
  repository: "Parcel-Protocol/utix",
  campaignId: "624dee9c-2bc5-48fc-ae07-3c2c2a8262e8",
  campaignName: "Stellar Wave",
  requiredLabels: ["GrantFox OSS", "Maybe Rewarded", "Stellar Wave"]
});
