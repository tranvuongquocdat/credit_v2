"use client";

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';

interface ActivityTrackerProps {
  inactivityTimeoutMs?: number; // Time in milliseconds before logout due to inactivity
}

export const ActivityTracker: React.FC<ActivityTrackerProps> = ({
  inactivityTimeoutMs = 8 * 60 * 1000 // Default: 8 minutes
}) => {
  const { user } = useAuth();
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;

    // Update last activity timestamp
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for inactivity logout
      timeoutRef.current = setTimeout(() => {
        // Use signOut function from auth.ts to ensure consistency
        signOut();
      }, inactivityTimeoutMs);
    };

    // List of events that indicate user activity
    const activityEvents = [
      'mousedown',
      'mousemove', 
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Add activity listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Initialize activity timer
    updateActivity();

    // Cleanup function
    return () => {
      // Remove activity listeners
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [user, inactivityTimeoutMs]);

  // This component renders nothing
  return null;
};

export default ActivityTracker; 