/**
 * @file CategorySelectContent.tsx
 * @description
 *   A thin wrapper around shadcn/ui `<SelectContent>` that renders a list of
 *   category options or an empty-state prompt in Bengali.
 *
 * ## Edge cases handled
 *   - Null / non-string items in `items` are filtered out before rendering.
 *     This guards against `useBulkCategories` returning unexpected DB nulls.
 *   - Empty array after filtering → renders a "কোনো ক্যাটাগরি পাওয়া যায়নি।"
 *     message with a link to `/admin/categories` so the admin can add one
 *     without leaving the current flow.
 *
 * ## Bengali UI
 *   - "কোনো ক্যাটাগরি পাওয়া যায়নি।" = "No categories found."
 *   - "যোগ করুন" = "Add one" (navigates to the category management page).
 *
 * @param props.items - Raw category name strings from `useBulkCategories`.
 */

import { SelectContent, SelectItem } from "@/components/ui/select";

interface Props {
  /** Category name strings to render as `<SelectItem>` options. */
  items: string[];
}

/**
 * Renders `<SelectContent>` populated with category items.
 *
 * Uses a `max-h-72` class on the content so long lists scroll in-place rather
 * than overflowing the viewport.
 *
 * @example
 * ```tsx
 * <Select value={category} onValueChange={setCategory}>
 *   <SelectTrigger><SelectValue placeholder="ক্যাটাগরি" /></SelectTrigger>
 *   <CategorySelectContent items={allCategories} />
 * </Select>
 * ```
 */
const CategorySelectContent = ({ items }: Props) => {
  // Guard: remove nulls, non-strings, and blank strings before rendering.
  // Without this, a null DB name would produce an empty <SelectItem> entry.
  const safe = items.filter(c => typeof c === "string" && c.trim().length > 0);

  if (!safe.length) {
    // Empty-state: prompt the admin to create categories first.
    return (
      <SelectContent>
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {/* Bengali: "No categories found." + link "Add one" */}
          কোনো ক্যাটাগরি পাওয়া যায়নি।{" "}
          <a href="/admin/categories" className="text-primary underline">যোগ করুন</a>
        </div>
      </SelectContent>
    );
  }

  return (
    // max-h-72 prevents the dropdown from growing taller than ~288 px.
    <SelectContent className="max-h-72">
      {safe.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
    </SelectContent>
  );
};

export default CategorySelectContent;
