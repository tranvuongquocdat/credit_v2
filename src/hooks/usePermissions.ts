"use client";

import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const {
    permissions,
    loading,
    error,
    isAdmin,
    hasPermission,
  } = useAuth();

  return { permissions, loading, error, isAdmin, hasPermission };
}
