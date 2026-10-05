import React from "react";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, description, checkpoint = 2 }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <h1 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </header>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Construction size={40} className="text-slate-300" />
        <div>
          <h2 className="font-display text-lg font-bold text-slate-700">Coming in Checkpoint {checkpoint}</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            The data model, navigation, and layout are ready. This page will be fully built in Checkpoint {checkpoint}.
          </p>
        </div>
      </div>
    </div>
  );
}