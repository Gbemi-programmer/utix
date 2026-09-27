import { describe, expect, it } from "vitest";
import { redactEndpoint, resolveEndpoint, resolveNetwork } from "@/core/network/config";

describe("resolveNetwork precedence", () => {
  it.each([
    ["mainnet", "testnet", "mainnet"],
    ["testnet", "mainnet", "testnet"],
    [null, "mainnet", "mainnet"],
    ["futurenet", "mainnet", "mainnet"],
    ["", undefined, "testnet"],
    [null, "MAINNET", "testnet"],
    [undefined, undefined, "testnet"]
  ])("stored=%s env=%s → %s", (stored, env, expected) => {
    expect(resolveNetwork(stored, env)).toBe(expected);
  });
});

describe("resolveEndpoint", () => {
  const fallback = "https://horizon-testnet.stellar.org";

  it("uses a valid http(s) override", () => {
    expect(resolveEndpoint("https://my-horizon.example/", fallback)).toBe("https://my-horizon.example/");
    expect(resolveEndpoint("  http://localhost:8000 ", fallback)).toBe("http://localhost:8000");
  });

  it.each([undefined, "", "   ", "not a url", "horizon.stellar.org", "ftp://x.example", "javascript:alert(1)"])(
    "falls back for %j",
    (override) => {
      expect(resolveEndpoint(override, fallback)).toBe(fallback);
    }
  );

  it("rejects overrides carrying credentials", () => {
    expect(resolveEndpoint("https://user:secret@rpc.example", fallback)).toBe(fallback);
  });
});

describe("redactEndpoint", () => {
  it("drops query strings, fragments and credentials", () => {
    const shown = redactEndpoint("https://u:p@rpc.example/v1?apiKey=SECRET#t=1");
    expect(shown).toBe("https://rpc.example/v1");
    expect(shown).not.toContain("SECRET");
  });

  it("does not echo malformed values", () => {
    expect(redactEndpoint("SSECRETKEY not a url")).toBe("[invalid endpoint]");
  });
});
