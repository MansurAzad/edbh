/**
 * @file CheckoutSteps.tsx
 * @description Horizontal step-indicator strip rendered at the top of every
 * checkout page. Three steps are hard-coded (Shipping → Payment → Review).
 * Completed / active steps are highlighted with the brand primary colour;
 * future steps are muted.
 */

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link CheckoutSteps}.
 */
interface Props {
  /**
   * The currently active step number (1 = Shipping, 2 = Payment, 3 = Review).
   * Any step whose index is ≤ `step` is rendered as "active/completed".
   */
  step: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `CheckoutSteps` – a three-step breadcrumb / progress indicator.
 *
 * Renders three numbered circles connected by horizontal rule dividers.
 * Labels are hidden on small screens (`hidden sm:block`) to keep the bar
 * compact on mobile.
 *
 * @example
 * ```tsx
 * // Show user is currently on the Payment step
 * <CheckoutSteps step={2} />
 * ```
 *
 * @param props - {@link Props}
 * @returns A flex row of numbered step badges with connecting dividers.
 */
export default function CheckoutSteps({ step }: Props) {
  return (
    /*
     * Outer flex container – centres the strip and adds bottom margin so the
     * checkout card below has breathing room.
     */
    <div className="flex items-center justify-center gap-4 mb-12">
      {/* Iterate over the three fixed steps */}
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          {/*
           * Step circle – fills with primary colour when the step is reached
           * (`step >= s`), otherwise falls back to the muted palette.
           */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s
                ? "bg-primary text-primary-foreground"   // active / completed
                : "bg-muted text-muted-foreground"        // upcoming
            }`}
          >
            {s}
          </div>

          {/*
           * Step label – hidden on mobile, visible on sm+ breakpoints.
           * Maps numeric index → human-readable name.
           */}
          <span
            className={`hidden sm:block ${
              step >= s ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {s === 1 ? "Shipping" : s === 2 ? "Payment" : "Review"}
          </span>

          {/*
           * Connector line – rendered between steps 1→2 and 2→3 but NOT
           * after the final step (s < 3 guard).
           */}
          {s < 3 && <div className="w-12 h-0.5 bg-border" />}
        </div>
      ))}
    </div>
  );
}
