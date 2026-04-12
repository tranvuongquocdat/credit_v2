"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth";

const LAST_HIDDEN_AT_KEY = "credit_lastHiddenAt";

/**
 * Spec-only targets for SSR-safe registration.
 * Capture: still sees events when bubble is stopped.
 * wheel + window scroll: nested overflow does not bubble `scroll`.
 * Passive: no preventDefault (keeps scrolling smooth).
 */
type ActivityListenerTarget = "document" | "window";

type ActivityListenerSpec = Readonly<{
  target: ActivityListenerTarget;
  type: string;
  options: boolean | AddEventListenerOptions;
}>;

const ACTIVITY_LISTENER_SPECS: readonly ActivityListenerSpec[] = [
  { target: "document", type: "pointerdown", options: true },
  { target: "document", type: "pointermove", options: true },
  { target: "document", type: "keydown", options: true },
  { target: "document", type: "wheel", options: { capture: true, passive: true } },
  { target: "document", type: "touchstart", options: true },
  { target: "document", type: "touchmove", options: { capture: true, passive: true } },
  { target: "document", type: "click", options: true },
  { target: "document", type: "input", options: true },
  { target: "document", type: "focusin", options: true },
  { target: "document", type: "compositionend", options: true },
  { target: "window", type: "scroll", options: { capture: true, passive: true } },
];

function resolveActivityTarget(which: ActivityListenerTarget): EventTarget {
  return which === "window" ? window : document;
}

interface ActivityTrackerProps {
  inactivityTimeoutMs?: number;
}

export const ActivityTracker: React.FC<ActivityTrackerProps> = ({
  inactivityTimeoutMs = 15 * 60 * 1000,
}) => {
  const { user } = useAuth();
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const clearScheduledLogout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    /** On tab visible again: wall-clock check; timers are unreliable while hidden. */
    const checkInactivity = (): boolean => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= inactivityTimeoutMs) {
        signOut();
        return true;
      }
      return false;
    };

    /** Re-verify lastActivity on fire; avoids races with rAF-batched reschedules. */
    const scheduleInactivityLogout = () => {
      clearScheduledLogout();
      const remaining = inactivityTimeoutMs - (Date.now() - lastActivityRef.current);
      if (remaining <= 0) {
        signOut();
        return;
      }
      timeoutRef.current = setTimeout(() => {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= inactivityTimeoutMs) {
          signOut();
          return;
        }
        scheduleInactivityLogout();
      }, remaining);
    };

    let rescheduleRafId: number | null = null;

    const cancelPendingReschedule = () => {
      if (rescheduleRafId != null) {
        cancelAnimationFrame(rescheduleRafId);
        rescheduleRafId = null;
      }
    };

    /** Bump timestamp immediately; coalesce timer work to once per frame (high-frequency events). */
    const onUserActivity: EventListener = () => {
      lastActivityRef.current = Date.now();
      if (document.visibilityState !== "visible") return;

      if (rescheduleRafId != null) return;

      clearScheduledLogout();
      rescheduleRafId = requestAnimationFrame(() => {
        rescheduleRafId = null;
        scheduleInactivityLogout();
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        try {
          localStorage.setItem(LAST_HIDDEN_AT_KEY, Date.now().toString());
        } catch {
          /* private mode / disabled storage */
        }
        cancelPendingReschedule();
        clearScheduledLogout();
        return;
      }

      if (document.visibilityState === "visible") {
        try {
          localStorage.removeItem(LAST_HIDDEN_AT_KEY);
        } catch {
          /* ignore */
        }
        if (checkInactivity()) return;
        cancelPendingReschedule();
        scheduleInactivityLogout();
      }
    };

    ACTIVITY_LISTENER_SPECS.forEach(({ target: which, type, options }) => {
      resolveActivityTarget(which).addEventListener(type, onUserActivity, options);
    });
    document.addEventListener("visibilitychange", onVisibilityChange);

    lastActivityRef.current = Date.now();
    if (document.visibilityState === "visible") {
      scheduleInactivityLogout();
    } else {
      try {
        localStorage.setItem(LAST_HIDDEN_AT_KEY, Date.now().toString());
      } catch {
        /* ignore */
      }
    }

    return () => {
      ACTIVITY_LISTENER_SPECS.forEach(({ target: which, type, options }) => {
        resolveActivityTarget(which).removeEventListener(type, onUserActivity, options);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelPendingReschedule();
      clearScheduledLogout();
    };
  }, [user, inactivityTimeoutMs]);

  return null;
};

export default ActivityTracker;
