"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import ActivityTracker from "@/components/ActivityTracker";

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
  const router = useRouter();

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
        console.log('Auth state change:', event, session);
        
        switch (event) {
          case 'SIGNED_IN':
            console.log('User signed in, refreshing auth data');
            fetchAuthData(true);
            break;

          case 'SIGNED_OUT':
            console.log('User signed out');
            setUser(null);
            setPermissions([]);
            setIsAdmin(false);
            setError(null);
            
            // Check if current page is public (consistent with middleware)
            const currentPath = window.location.pathname;
            const publicPaths = ['/', '/login', '/signup', '/portfolio/about', '/portfolio/projects'];
            const isPublicPath = publicPaths.includes(currentPath);
            
            // If not on a public path, redirect to home
            if (!isPublicPath) {
              router.push('/');
            }
            break;

          case 'USER_UPDATED':
            console.log('User updated, refreshing auth data');
            fetchAuthData(true);
            break;

          case 'TOKEN_REFRESHED':
            console.log('Token refreshed');
            // User không đổi, chỉ cập nhật token trong state nếu muốn
            setUser((prev: any | null) => (prev ? { ...prev, ...session?.user } : prev));
            break;

          default:
            break;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchAuthData, router]);

  const hasPermission = (permissionId: string) =>
    isAdmin ? true : permissions.includes(permissionId);

  const value = useMemo(
    () => ({ user, permissions, loading, error, isAdmin, hasPermission }),
    [user, permissions, loading, error, isAdmin]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Activity Tracker - Only active when user is logged in, no UI */}
      {user && <ActivityTracker />}
    </AuthContext.Provider>
  );
}; 