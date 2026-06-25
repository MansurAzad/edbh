/**
 * @file ErrorBoundary.tsx
 * @module components/ErrorBoundary
 *
 * Global React error boundary. Catches render-time crashes inside any descendant
 * tree, logs them to the console, and renders a friendly bilingual fallback
 * with "Reload" and "Go home" actions instead of a white screen.
 *
 * রেন্ডার-টাইম ক্র্যাশ ধরে ব্যবহারকারীকে বন্ধুত্বপূর্ণ বার্তা ও পুনরায় লোডের অপশন দেখায়।
 *
 * Note: error boundaries only catch errors thrown during render / lifecycle /
 * constructors of children — NOT inside event handlers or async callbacks.
 * For those, use try/catch + `getFriendlyError` + toast.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  /** Subtree to protect from render-time errors. */
  children: ReactNode;
  /** Optional custom fallback renderer. Receives the error + a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  /** React lifecycle: derive state from a thrown error. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /** React lifecycle: side-effects after catching (logging, telemetry). */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the stack trace visible in dev tools / Lovable console.
    // Production telemetry can hook in here later (Sentry, etc.).
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  /** Clears the error state so children re-render. */
  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    // Default fallback UI — minimal, theme-aware, no external deps.
    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-background p-6"
      >
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              কিছু একটা সমস্যা হয়েছে
            </h1>
            <p className="text-sm text-muted-foreground">
              Something went wrong while loading this page. আপনি রিলোড করে আবার চেষ্টা করতে পারেন।
            </p>
            {/* Show the technical message in small print — helpful for users
                relaying bugs to support but not alarming. */}
            <p className="text-xs text-muted-foreground/70 break-words pt-2">
              {error.message}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={this.reset}>
              আবার চেষ্টা করুন / Try again
            </Button>
            <Button onClick={() => (window.location.href = "/")}>
              হোমে যান / Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
