import React from "react";

// Error boundary wrapping every page. Shows a friendly reload prompt and
// never loses drafts (the reload is a full remount, not a data wipe).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error("Page error boundary:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-2xl">⚠️</div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-700">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-500">Tap to reload. Your drafts and queued photos are safe.</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false }, () => window.location.reload())}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}