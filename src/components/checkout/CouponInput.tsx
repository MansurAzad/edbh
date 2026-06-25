/**
 * @file CouponInput.tsx
 * @description Self-contained coupon / promo-code input widget used on the
 * checkout page. Handles its own Supabase query, validates the coupon against
 * active status, date window, usage cap, and minimum order amount, then
 * delegates the result upwards via callbacks.
 *
 * Two visual states:
 *  1. **Input mode** – text field + "Apply" button.
 *  2. **Applied mode** – read-only badge showing the active coupon with a
 *     remove (×) button.
 */

import { useState } from "react";
import { Tag, Loader2, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Subset of the `coupons` Supabase table row that this component needs.
 * All monetary values are in BDT (Bangladeshi Taka / ৳).
 */
interface Coupon {
  /** Primary key of the coupon row */
  id: string;

  /** Human-readable promo code, e.g. "SUMMER20" */
  code: string;

  /**
   * Optional marketing description shown beneath the code badge once the
   * coupon is applied. May be `null` when left blank in the admin panel.
   */
  description: string | null;

  /**
   * Determines how `discount_value` is interpreted:
   * - `"percentage"` → `discount_value` is a percentage of `subtotal`
   * - anything else  → `discount_value` is a flat ৳ amount
   */
  discount_type: string;

  /** Numeric discount magnitude – see `discount_type` for interpretation */
  discount_value: number;

  /**
   * The cart subtotal (in ৳) required before this coupon can be applied.
   * `null` means no minimum.
   */
  minimum_order_amount: number | null;

  /**
   * Number of times this coupon has already been redeemed.
   * Optional because the admin view may omit it in lightweight queries.
   */
  current_uses?: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link CouponInput}.
 */
interface CouponInputProps {
  /**
   * Current cart subtotal in ৳, used to validate minimum order requirements
   * and to calculate percentage discounts.
   */
  subtotal: number;

  /**
   * The currently applied coupon, or `null` if none has been applied yet.
   * When non-null the component renders the "applied" badge view instead of
   * the text-input view.
   */
  appliedCoupon: Coupon | null;

  /**
   * Called when a valid coupon has been successfully validated.
   *
   * @param coupon         - The full coupon row from the database.
   * @param discountAmount - The calculated discount in ৳ to subtract from the total.
   */
  onApplyCoupon: (coupon: Coupon, discountAmount: number) => void;

  /**
   * Called when the user clicks the × button to remove the applied coupon.
   * The parent should reset its coupon and discount state.
   */
  onRemoveCoupon: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `CouponInput` – promo code entry + validation widget.
 *
 * ### Validation order (all checks run server-side data + client logic):
 * 1. Code must exist in `coupons` table and have `is_active = true`.
 * 2. `valid_from` must be in the past (or absent).
 * 3. `valid_until` must be in the future (or absent).
 * 4. `current_uses` must be below `max_uses` (or `max_uses` absent).
 * 5. Cart `subtotal` must meet `minimum_order_amount` (or no minimum set).
 *
 * On success `onApplyCoupon` is invoked and the input clears itself.
 *
 * @example
 * ```tsx
 * <CouponInput
 *   subtotal={cartSubtotal}
 *   appliedCoupon={appliedCoupon}
 *   onApplyCoupon={(coupon, amount) => setDiscount(amount)}
 *   onRemoveCoupon={() => setAppliedCoupon(null)}
 * />
 * ```
 *
 * @param props - {@link CouponInputProps}
 */
const CouponInput = ({
  subtotal,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
}: CouponInputProps) => {
  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  /** The raw string typed by the user, auto-uppercased on change */
  const [code, setCode] = useState("");

  /** True while the Supabase coupon lookup is in-flight */
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Calculates the discount amount in ৳ for a given coupon.
   *
   * - `"percentage"` coupons: `floor(subtotal * value / 100)` rounded to the
   *   nearest integer taka to avoid fractional-currency display issues.
   * - Flat coupons: returns `discount_value` directly.
   *
   * @param coupon - The validated coupon row.
   * @returns Discount amount in ৳.
   */
  const calculateDiscount = (coupon: Coupon): number => {
    if (coupon.discount_type === "percentage") {
      // Percentage discount: e.g. 20 % of ৳1 500 = ৳300
      return Math.round((subtotal * coupon.discount_value) / 100);
    }
    // Flat-amount discount: return as-is (already in ৳)
    return coupon.discount_value;
  };

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /**
   * Validates the typed coupon code against the Supabase `coupons` table and
   * runs client-side checks in sequence. Calls `onApplyCoupon` on success or
   * surfaces a descriptive toast on failure.
   *
   * Called when the user clicks "Apply" or presses Enter inside the input.
   */
  const handleApply = async () => {
    // Guard: do nothing if the input is blank
    if (!code.trim()) {
      toast({
        title: "Enter a code",
        description: "Please enter a coupon code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // -----------------------------------------------------------------------
      // 1. Fetch coupon from Supabase
      //    - Match code exactly (case-insensitive via .toUpperCase())
      //    - Only return active coupons
      //    - Limit 1 – codes are unique by design
      // -----------------------------------------------------------------------
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code.toUpperCase().trim())
        .eq("is_active", true)
        .limit(1);

      const coupon = data?.[0] ?? null;

      if (error || !coupon) {
        // Coupon not found OR Supabase returned an error
        toast({
          title: "Coupon not found",
          description: "This code is invalid or has expired",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // -----------------------------------------------------------------------
      // 2. Validity window checks
      // -----------------------------------------------------------------------
      const now = new Date();

      // Coupon hasn't started yet (valid_from is in the future)
      if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        toast({
          title: "Coupon not yet active",
          description: "This coupon is not available yet",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Coupon has already expired (valid_until is in the past)
      if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        toast({
          title: "Coupon expired",
          description: "This coupon has expired",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // -----------------------------------------------------------------------
      // 3. Usage cap check
      //    `max_uses` of null / 0 means unlimited
      // -----------------------------------------------------------------------
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        toast({
          title: "Coupon exhausted",
          description: "This coupon has reached its usage limit",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // -----------------------------------------------------------------------
      // 4. Minimum order amount check
      //    Displayed in Bengali taka format: ৳X,XXX
      // -----------------------------------------------------------------------
      if (
        coupon.minimum_order_amount &&
        subtotal < coupon.minimum_order_amount
      ) {
        toast({
          title: "Minimum order required",
          // Bengali UI: "আপনার অর্ডারে কমপক্ষে ৳X,XXX থাকতে হবে"
          description: `You need at least ৳${Number(
            coupon.minimum_order_amount,
          ).toLocaleString()} to use this coupon`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // -----------------------------------------------------------------------
      // 5. All checks passed – calculate and propagate
      // -----------------------------------------------------------------------
      const discountAmount = calculateDiscount(coupon);
      onApplyCoupon(coupon, discountAmount);
      setCode(""); // clear the input field

      toast({
        title: "Coupon applied! 🎉",
        // Bengali UI: "আপনি ৳X বাঁচালেন"
        description: `You saved ৳${discountAmount.toLocaleString()}`,
      });
    } catch (error) {
      // Unexpected network / runtime error
      console.error("Coupon error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      // Always release the loading spinner regardless of outcome
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render – "applied" state
  // ---------------------------------------------------------------------------

  /**
   * When a coupon is already applied, render a compact green-tinted badge
   * with the code, description, and a remove (×) button.
   */
  if (appliedCoupon) {
    return (
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
        <div className="flex items-center justify-between">
          {/* Left side: checkmark + code + description */}
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-primary" />
            <div>
              {/* Coupon code in brand colour */}
              <span className="font-medium text-primary">
                {appliedCoupon.code}
              </span>
              {/* Optional marketing description (may be null) */}
              <p className="text-xs text-muted-foreground">
                {appliedCoupon.description}
              </p>
            </div>
          </div>

          {/* Remove button – triggers parent reset */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveCoupon}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render – "input" state
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Tag icon decorates the left edge of the input */}
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={code}
            // Auto-uppercase so the user doesn't have to worry about case
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Coupon code"
            className="pl-10 uppercase"
            // Allow submission via the Enter key for convenience
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />
        </div>

        {/* Apply button – spins while the network request is in-flight */}
        <Button onClick={handleApply} disabled={loading} variant="outline">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
        </Button>
      </div>

      {/* Helper text below the input (Bengali UI: "এখানে কুপন কোড দিন") */}
      <p className="text-xs text-muted-foreground">Enter your coupon code here</p>
    </div>
  );
};

export default CouponInput;
