"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseDynamicRevealFocusOptions<
  TTarget extends HTMLElement = HTMLElement
> {
  /** Optional callback invoked when the revealed target element receives focus. */
  onFocus?: (element: TTarget) => void;
  /** Prevent browser auto-scrolling to the focused element. Defaults to false. */
  preventScroll?: boolean;
}

/**
 * Hook to manage focus transitions when dynamic fields, fieldsets, or banners are conditionally revealed.
 *
 * Guarantees:
 * 1. Focus moves explicitly and ONLY on discrete user trigger actions (`triggerReveal()`),
 *    never on unrelated component re-renders (e.g., background data polling, parent re-renders,
 *    or input keystrokes in unaffected fields).
 * 2. When the conditionally revealed element/group appears, focus lands on the target element
 *    (e.g., first input, legend, or heading).
 * 3. When the revealed group is dismissed/hidden, focus can optionally return to the triggering control (`triggerDismiss()`).
 */
export function useDynamicRevealFocus<
  TTarget extends HTMLElement = HTMLElement,
  TTrigger extends HTMLElement = HTMLElement
>(options: UseDynamicRevealFocusOptions<TTarget, TTrigger> = {}) {
  const targetRef = useRef<TTarget | null>(null);
  const triggerRef = useRef<TTrigger | null>(null);
  const pendingRevealRef = useRef<boolean>(false);
  const pendingDismissRef = useRef<boolean>(false);

  /** Call in the discrete user event handler (e.g. onChange, onClick) when revealing dynamic content. */
  const triggerReveal = useCallback(() => {
    pendingRevealRef.current = true;
    pendingDismissRef.current = false;
  }, []);

  /** Call in the discrete user event handler when hiding/collapsing dynamic content. */
  const triggerDismiss = useCallback(() => {
    pendingDismissRef.current = true;
    pendingRevealRef.current = false;
  }, []);

  useEffect(() => {
    if (pendingRevealRef.current) {
      pendingRevealRef.current = false;
      const target = targetRef.current;
      if (target) {
        if (!target.hasAttribute("tabindex") && target.tabIndex === -1) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: options.preventScroll });
        options.onFocus?.(target);
      }
    } else if (pendingDismissRef.current) {
      pendingDismissRef.current = false;
      const trigger = triggerRef.current;
      if (trigger) {
        trigger.focus({ preventScroll: options.preventScroll });
      }
    }
  });

  return {
    targetRef,
    triggerRef,
    triggerReveal,
    triggerDismiss
  };
}
