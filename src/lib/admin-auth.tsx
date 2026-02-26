import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";

type AdminUser = { email: string } | null;

type AdminAuthContextType = {
  admin: AdminUser;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const ADMIN_KEY = "kt_admin";
const ADMIN_ACC_KEY = "kt_admin_accounts";
const AUTH_MODE = (import.meta as ImportMeta).env?.VITE_AUTH_BACKEND || "local";

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const readAdmins = (): Array<{ email: string; password: string }> => {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_ACC_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeAdmins = (accs: Array<{ email: string; password: string }>) => {
  localStorage.setItem(ADMIN_ACC_KEY, JSON.stringify(accs));
};

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser>(null);

  useEffect(() => {
    if (AUTH_MODE === "supabase" && supabase) {
      void (async () => {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (u && (u.user_metadata?.role === "admin")) {
          setAdmin({ email: u.email || "" });
        }
      })();
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user;
        if (u && (u.user_metadata?.role === "admin")) {
          setAdmin({ email: u.email || "" });
        } else {
          setAdmin(null);
        }
      });
      return () => {
        sub.subscription.unsubscribe();
      };
    } else {
      const admins = readAdmins();
      if (admins.length === 0) {
        writeAdmins([
          { email: "admin@demo.id", password: "admin123" },
          { email: "admin@kerjatim.id", password: "admin123" }
        ]);
      }
      const raw = localStorage.getItem(ADMIN_KEY);
      if (raw) {
        try {
          setAdmin(JSON.parse(raw));
        } catch {
          setAdmin(null);
        }
      }
    }
  }, []);

  const login = async (email: string, password: string) => {
    if (AUTH_MODE === "supabase" && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new Error(error?.message || "Email atau password admin salah");
      if (data.user.user_metadata?.role !== "admin") {
        await supabase.auth.signOut();
        throw new Error("Akun ini bukan admin");
      }
      setAdmin({ email: data.user.email || "" });
    } else {
      const admins = readAdmins();
      const found = admins.find((a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
      if (!found) throw new Error("Email atau password admin salah");
      const a = { email: found.email };
      localStorage.setItem(ADMIN_KEY, JSON.stringify(a));
      setAdmin(a);
    }
  };

  const logout = () => {
    if (AUTH_MODE === "supabase" && supabase) {
      void supabase.auth.signOut();
      setAdmin(null);
    } else {
      localStorage.removeItem(ADMIN_KEY);
      setAdmin(null);
    }
  };

  return <AdminAuthContext.Provider value={{ admin, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};

export function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { admin } = useAdminAuth();
  const location = useLocation();
  if (!admin) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return children;
}
