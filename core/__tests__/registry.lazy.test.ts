import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { generatedFeatures } from "@/core/registry/registry.generated";
import { findFeature, loadFeaturePanel } from "@/core/registry/registry";
import type { FeatureEntry } from "@/core/registry/types";

function entryWith(load: FeatureEntry["load"]): FeatureEntry {
  return { manifest: generatedFeatures[0].manifest, load };
}

describe("feature registry laziness", () => {
  it("exposes lazy loaders instead of eager panel modules", () => {
    expect(Array.isArray(generatedFeatures)).toBe(true);
    expect(generatedFeatures.length).toBeGreaterThan(0);
    expect(generatedFeatures[0]).toHaveProperty("load");
    expect(generatedFeatures[0]).not.toHaveProperty("Panel");
  });

  it("returns undefined for unknown slugs", () => {
    expect(findFeature("definitely-not-a-tool")).toBeUndefined();
  });
});

describe("loadFeaturePanel", () => {
  it("returns the panel when the import resolves", async () => {
    const Panel: ComponentType = () => null;
    const result = await loadFeaturePanel(entryWith(async () => Panel));
    expect(result).toEqual({ ok: true, value: Panel });
  });

  it("turns a rejected chunk import into a typed, message-free failure", async () => {
    const chunkError = new Error("Loading chunk 42 failed: https://cdn/x.js?token=abc");
    chunkError.name = "ChunkLoadError";
    const feature = entryWith(() => Promise.reject(chunkError));

    const result = await loadFeaturePanel(feature);

    expect(result).toEqual({
      ok: false,
      code: "load_failed",
      detail: { slug: feature.manifest.slug, errorName: "ChunkLoadError" }
    });
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("handles non-Error rejections", async () => {
    const result = await loadFeaturePanel(entryWith(() => Promise.reject("boom")));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail?.errorName).toBe("UnknownError");
  });
});
