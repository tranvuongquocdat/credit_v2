"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth";

const LAST_HIDDEN_AT_KEY = "credit_lastHiddenAt";

interface ActivityTrackerProps {
  inactivityTimeoutMs?: number;
}

export const ActivityTracker: React.FC<ActivityTrackerProps> = ({
  inactivityTimeoutMs = 1 * 60 * 1000,
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

    const checkInactivity = (): boolean => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= inactivityTimeoutMs) {
        signOut();
        return true;
      }
      return false;
    };

    const scheduleInactivityLogout = () => {
      clearScheduledLogout();
      const remaining = inactivityTimeoutMs - (Date.now() - lastActivityRef.current);
      if (remaining <= 0) {
        signOut();
        return;
      }
      timeoutRef.current = setTimeout(() => {
        signOut();
      }, remaining);
    };

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      if (document.visibilityState === "visible") {
        scheduleInactivityLogout();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        try {
          localStorage.setItem(LAST_HIDDEN_AT_KEY, Date.now().toString());
        } catch {
          /* private mode / disabled storage */
        }
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
        scheduleInactivityLogout();
      }
    };

    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    activityEvents.forEach((event) => {
      document.addEventListener(event, updateActivity, true);
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
      activityEvents.forEach((event) => {
        document.removeEventListener(event, updateActivity, true);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearScheduledLogout();
    };
  }, [user, inactivityTimeoutMs]);

  return null;
};

export default ActivityTracker;
