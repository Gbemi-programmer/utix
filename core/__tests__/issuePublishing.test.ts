import { describe, it, expect } from "vitest";
import { DEFAULT_REPO, LEGACY_REPOS, resolveRepository } from "../../scripts/repo-config.mjs";

describe("Contributor Issue Publishing Metadata (#108)", () => {
  it("defaults to Parcel-Protocol/utix when no GH_REPO is set", () => {
    const repo = resolveRepository(undefined);
    expect(repo).toBe("Parcel-Protocol/utix");
    expect(DEFAULT_REPO).toBe("Parcel-Protocol/utix");
  });

  it("accepts a valid custom GH_REPO", () => {
    const repo = resolveRepository("MyOrg/my-utix-fork");
    expect(repo).toBe("MyOrg/my-utix-fork");
  });

  it("rejects legacy RevyHub repositories", () => {
    for (const legacy of LEGACY_REPOS) {
      expect(() => resolveRepository(legacy)).toThrow(/legacy repository/i);
    }
    expect(() => resolveRepository("AnyOrg/RevyHub")).toThrow(/legacy repository/i);
    expect(() => resolveRepository("RevenantLabs/RevyHub")).toThrow(/legacy repository/i);
  });

  it("rejects invalid repository formats", () => {
    expect(() => resolveRepository("invalid-repo-no-owner")).toThrow(/invalid repository format/i);
    expect(() => resolveRepository("owner/repo/extra")).toThrow(/invalid repository format/i);
  });
});
