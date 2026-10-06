import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { Sparkles, X, Send, Loader2 } from "lucide-react";

export default function AskAIPanel({ open, onClose }) {
  const { project, locations, companies, templates } = useQaData();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const ctx = `Project: ${project?.name || "?"}. User role: ${user?.role}. Companies: ${(companies || []).map((c) => c.name).join(", ")}. Locations: ${locations?.length || 0}. Templates: ${(templates || []).map((t) => t.name).join(", ")}.`;
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a read-only QA assistant for the Cranmore QA construction app. Answer questions about the project using this context: ${ctx}. Question: ${q}. Be concise. Never suggest changing data — you can only read and summarise.`,
      });
      setMessages((prev) => [...prev, { role: "ai", text: typeof res === "string" ? res : JSON.stringify(res) }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "ai", text: "Sorry, I couldn't process that. Please try again." }]);
    }
    setLoading(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Sparkles size={18} className="text-emerald-600" />
          <h3 className="font-bold text-slate-800">Ask AI</h3>
          <span className="text-xs text-slate-400">Read-only</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-8">
              Ask me about your project — Visis, locations, trades, progress.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-slate-100 rounded-lg px-3 py-2"><Loader2 size={16} className="animate-spin text-slate-400" /></div></div>}
        </div>
        <div className="border-t border-slate-200 p-3 flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your project..." className="flex-1 rounded-lg border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={send} disabled={!input.trim() || loading} className="rounded-lg bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}