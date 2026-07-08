/**
 * @file submitGuard.ts
 * @description Tiny synchronous re-entrancy lock used by the checkout page
 * to block double clicks on the "Place Order" button. Extracted so it can
 * be unit-tested independently of React and Supabase.
 *
 * Usage:
 *   const guard = createSubmitGuard();
 *   if (!guard.tryAcquire()) return;   // second click aborts
 *   try { await placeOrder() } finally { guard.release() }
 */

export interface SubmitGuard {
  /** Returns true if the caller successfully acquired the lock. */
  tryAcquire: () => boolean;
  /** Releases the lock so a future click can start a new attempt. */
  release: () => void;
  /** Non-blocking read. */
  isLocked: () => boolean;
}

export function createSubmitGuard(): SubmitGuard {
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}
