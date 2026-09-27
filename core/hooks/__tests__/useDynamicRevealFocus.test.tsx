import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useDynamicRevealFocus } from "@/core/hooks/useDynamicRevealFocus";

function TestComponent() {
  const [showFields, setShowFields] = useState(false);
  const [unrelatedCount, setUnrelatedCount] = useState(0);
  const { targetRef, triggerRef, triggerReveal, triggerDismiss } = useDynamicRevealFocus<HTMLInputElement, HTMLSelectElement>();

  return (
    <div>
      <label htmlFor="selector">Choose option</label>
      <select
        id="selector"
        ref={triggerRef}
        value={showFields ? "revealed" : "hidden"}
        onChange={(e) => {
          if (e.target.value === "revealed") {
            setShowFields(true);
            triggerReveal();
          } else {
            setShowFields(false);
            triggerDismiss();
          }
        }}
      >
        <option value="hidden">Hidden</option>
        <option value="revealed">Revealed</option>
      </select>

      <label htmlFor="other-input">Other Input</label>
      <input id="other-input" data-testid="other-input" />

      <button
        type="button"
        onClick={() => setUnrelatedCount((c) => c + 1)}
        data-testid="re-render-btn"
      >
        Re-render {unrelatedCount}
      </button>

      {showFields ? (
        <fieldset aria-label="Dynamic section">
          <legend>Dynamic section</legend>
          <label htmlFor="revealed-input">Revealed field</label>
          <input id="revealed-input" ref={targetRef} data-testid="revealed-input" />
        </fieldset>
      ) : null}
    </div>
  );
}

describe("useDynamicRevealFocus", () => {
  it("does not steal focus on initial render", () => {
    render(<TestComponent />);
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the revealed input on explicit user trigger", () => {
    render(<TestComponent />);
    const select = screen.getByLabelText("Choose option");

    fireEvent.change(select, { target: { value: "revealed" } });

    const revealedInput = screen.getByTestId("revealed-input");
    expect(document.activeElement).toBe(revealedInput);
  });

  it("does not steal focus during unrelated re-renders", () => {
    render(<TestComponent />);
    const select = screen.getByLabelText("Choose option");

    fireEvent.change(select, { target: { value: "revealed" } });
    expect(document.activeElement).toBe(screen.getByTestId("revealed-input"));

    // User moves focus to another input
    const otherInput = screen.getByTestId("other-input");
    otherInput.focus();
    expect(document.activeElement).toBe(otherInput);

    // Unrelated background update / re-render occurs
    fireEvent.click(screen.getByTestId("re-render-btn"));
    // Focus MUST remain on otherInput!
    expect(document.activeElement).toBe(otherInput);
  });

  it("returns focus to trigger control when dynamic content is dismissed", () => {
    render(<TestComponent />);
    const select = screen.getByLabelText("Choose option");

    // Reveal
    fireEvent.change(select, { target: { value: "revealed" } });
    expect(document.activeElement).toBe(screen.getByTestId("revealed-input"));

    // Dismiss
    fireEvent.change(select, { target: { value: "hidden" } });
    expect(document.activeElement).toBe(select);
  });
});
