import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  secretKeyUri,
  validPayUri
} from "@/features/payment-uri-parser/fixtures/paymentUriParser.fixture";
import { usePaymentUriParser } from "@/features/payment-uri-parser/hooks/usePaymentUriParser";

describe("usePaymentUriParser hook", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePaymentUriParser());
    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("handles valid URI parsing", async () => {
    const { result } = renderHook(() => usePaymentUriParser());

    await act(async () => {
      await result.current.parse({ uri: validPayUri });
    });

    expect(result.current.status).toBe("success");
    expect(result.current.result?.isValid).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("handles invalid scheme error", async () => {
    const { result } = renderHook(() => usePaymentUriParser());

    await act(async () => {
      await result.current.parse({ uri: "invalid-scheme:foo" });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("invalid_scheme");
    expect(result.current.result).toBeNull();
  });

  it("handles secret key detection", async () => {
    const { result } = renderHook(() => usePaymentUriParser());

    await act(async () => {
      await result.current.parse({ uri: secretKeyUri });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("secret_key_detected");
  });

  it("resets back to idle state", async () => {
    const { result } = renderHook(() => usePaymentUriParser());

    await act(async () => {
      await result.current.parse({ uri: validPayUri });
    });

    expect(result.current.status).toBe("success");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
  });
});
