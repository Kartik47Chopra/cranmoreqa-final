import React from "react";
import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon size={26} className="text-slate-400" />
      </div>
      <div>
        <h3 className="font-display text-base font-bold text-slate-700">{title}</h3>
        {message && <p className="mt-1 text-sm text-slate-500 max-w-sm">{message}</p>}
      </div>
      {action}
    </div>
  );
}