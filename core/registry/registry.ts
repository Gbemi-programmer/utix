import type { ComponentType } from "react";
import { generatedRegistrySchemaVersion } from "@/core/registry/panels.generated";
import { generatedFeatures } from "@/core/registry/registry.generated";
import { err, ok, type Result } from "@/core/result/result";
import { assertFeatureRegistryVersion } from "@/core/registry/schema";
import { findManifest } from "@/core/registry/manifests";
import type { FeatureEntry } from "@/core/registry/types";

/**
 * Feature lookup used by the `/tools/[slug]` route only.
 *
 * The registry keeps manifest metadata eagerly available for navigation/search,
 * while each entry exposes a lazy loader for the panel implementation. That way
 * the shared nav bundle stays metadata-only and the active tool's code loads on
 * demand.
 */
assertFeatureRegistryVersion(generatedRegistrySchemaVersion, "tool panel registry");

export function findFeature(slug: string): FeatureEntry | undefined {
  const manifest = findManifest(slug);
  const feature = generatedFeatures.find((entry) => entry.manifest.slug === slug);
  if (!manifest || !feature) return undefined;
  return { manifest, load: feature.load };
}

export type FeatureLoadError = "load_failed";

/** Telemetry-safe context for a failed panel import: no stack, no raw message. */
export interface FeatureLoadFailure {
  slug: string;
  errorName: string;
}

/**
 * Loads a panel, turning a rejected dynamic import (stale chunk after a
 * deploy, offline, a slice that throws on evaluation) into a typed error so the
 * route can show recovery UI instead of a blank page. Unknown slugs never
 * reach here — `findFeature` returns undefined for them.
 */
export async function loadFeaturePanel(
  feature: FeatureEntry
): Promise<Result<ComponentType, FeatureLoadError, FeatureLoadFailure>> {
  try {
    return ok(await feature.load());
  } catch (error) {
    return err("load_failed", {
      slug: feature.manifest.slug,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

export { featureHref, featureSlugs, manifests, manifestsByCategory } from "@/core/registry/manifests";
