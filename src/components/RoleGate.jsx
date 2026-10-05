import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { ShieldAlert } from "lucide-react";

// Blocks direct URL access to pages a role shouldn't use (not just hidden nav items).
export default function RoleGate({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert size={36} className="text-slate-300" />
        <div>
          <h2 className="font-display text-lg font-bold text-slate-700">You don't have access</h2>
          <p className="mt-1 text-sm text-slate-500">This page is restricted to {roles.join(" / ")} roles.</p>
        </div>
      </div>
    );
  }
  return children;
}