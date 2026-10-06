import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Reliable back button: uses browser history if available, falls back to a route.
// On mobile, going back to "/" opens the sidebar drawer (handled by Layout).
export default function BackButton({ fallback = "/", className = "", label }) {
  const navigate = useNavigate();

  function handleBack() {
    // If we have history (came from another page in this session), go back
    if (window.history.state?.idx > 0 || window.history.length > 2) {
      navigate(-1);
    } else {
      // No history — go to fallback route
      navigate(fallback);
    }
  }

  if (label) {
    return (
      <button onClick={handleBack} className={`flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 ${className}`}>
        <ArrowLeft size={16} /> {label}
      </button>
    );
  }

  return (
    <button onClick={handleBack} className={`p-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 ${className}`} aria-label="Go back">
      <ArrowLeft size={20} />
    </button>
  );
}