"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface AuthContextType {
  user: any | null;
  permissions: string[];
  loading: boolean;
  error: Error | null;
  isAdmin: boolean;
  hasPermission: (permissionId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAuthData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser(forceRefresh);
      setUser(currentUser);

      // Nếu không có user hợp lệ ⇒ reset quyền & isAdmin
      if (!currentUser || !currentUser.id) {
        setIsAdmin(false);
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Admin => all permissions implicitly
      if (currentUser.role === "admin") {
        setIsAdmin(true);
        setPermissions([]);
        setLoading(false);
        return;
      }

      if (currentUser.role !== "employee") {
        // Những role khác (superadmin, v.v.) ⇒ không phải admin nên reset cờ
        setIsAdmin(false);
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Fetch employee row to get id
      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", currentUser.id)
        .single();

      if (employeeError || !employeeData) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Fetch permissions list
      const { data: permissionData, error: permissionError } = await supabase
        .from("employee_permissions")
        .select("permission_id")
        .eq("employee_id", employeeData.id);

      if (permissionError) throw permissionError;

      const ids = permissionData?.map((p) => p.permission_id) || [];
      setIsAdmin(false);                   // nhân viên ⇒ chắc chắn không phải admin
      setPermissions(ids);
    } catch (err) {
      console.error("AuthProvider error:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAuthData(); }, [fetchAuthData]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        switch (event) {
          case 'SIGNED_IN':
          case 'SIGNED_OUT':
          case 'USER_UPDATED':
            fetchAuthData(true);        // cần tải lại
            break;

          case 'TOKEN_REFRESHED':
            // User không đổi, chỉ cập nhật token trong state nếu muốn
            setUser((prev: any | null) => (prev ? { ...prev, ...session?.user } : prev));
            // KHÔNG setLoading(true) ⇒ UI không flicker
            break;

          default:
            break;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchAuthData]);

  const hasPermission = (permissionId: string) =>
    isAdmin ? true : permissions.includes(permissionId);

  const value = useMemo(
    () => ({ user, permissions, loading, error, isAdmin, hasPermission }),
    [user, permissions, loading, error, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 