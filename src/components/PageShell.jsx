import React from "react";
// Shared page shell: sticky header (title + subtitle + actions), scrollable
// content area, and a footer with version + last updated. Uses 100dvh so the
// page scrolls with one finger on mobile — no overflow:hidden on the root.
export default function PageShell({ title, subtitle, actions, children, loading }) {
  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4">
        <div className="flex flex-col gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-2xl font-bold uppercase tracking-tight text-slate-900 break-words leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4">
        {loading ? <PageSkeleton /> : children}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 md:px-6 py-2 text-center text-[11px] text-slate-400">
        Cranmore QA, version 1.0, last updated 05/10/2026
      </footer>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-slate-200 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}