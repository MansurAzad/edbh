// ============= Full file contents =============

/**
 * @file utils.ts
 * @module lib/utils
 *
 * @description
 * General-purpose utility helpers shared across the entire application.
 *
 * Currently exports a single helper, {@link cn}, for merging Tailwind CSS
 * class names safely. Additional stateless, side-effect-free utilities that
 * don't belong to a more specific module should be added here.
 *
 * **Dependencies**
 * - [`clsx`](https://github.com/lukeed/clsx) — conditionally joins class strings.
 * - [`tailwind-merge`](https://github.com/dcastil/tailwind-merge) — resolves
 *   Tailwind class conflicts so later classes win (e.g. `p-2 p-4` → `p-4`).
 *
 * বাংলা টীকা:
 * এই ফাইলটি অ্যাপ জুড়ে ব্যবহৃত সাধারণ সহায়ক ফাংশন ধারণ করে।
 * বর্তমানে শুধু `cn` ফাংশন আছে যা Tailwind CSS ক্লাস নাম একত্রিত করে।
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges any number of class values into a single, conflict-free class string.
 *
 * Internally pipes the arguments through two stages:
 * 1. **`clsx`** — flattens arrays, drops falsy values, joins conditionals.
 * 2. **`twMerge`** — resolves Tailwind utility conflicts so the last matching
 *    class in the argument list wins (mirroring CSS cascade order).
 *
 * This combination is the idiomatic pattern for component libraries built on
 * Tailwind CSS with dynamic/conditional classes (e.g. CVA variants).
 *
 * @param {...ClassValue} inputs - Any mix of strings, arrays, objects, or
 *   falsy values accepted by `clsx`.
 * @returns {string} A single merged, deduplicated class string.
 *
 * @example
 * // Basic conditional class
 * cn("px-4 py-2", isActive && "bg-blue-500");
 * // → "px-4 py-2 bg-blue-500"  (when isActive is true)
 *
 * @example
 * // Conflict resolution — p-4 wins over p-2
 * cn("p-2 text-sm", "p-4");
 * // → "text-sm p-4"
 *
 * @example
 * // Object syntax (clsx feature)
 * cn({ "opacity-50": isDisabled, "cursor-not-allowed": isDisabled });
 *
 * বাংলা: Tailwind CSS ক্লাস নাম একত্রিত করার ফাংশন।
 * `clsx` দিয়ে শর্তসাপেক্ষ ক্লাস যোগ করা হয়, তারপর `twMerge` দিয়ে
 * পরস্পরবিরোধী Tailwind ক্লাস সমাধান করা হয় (শেষেরটি জেতে)।
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
