/**
 * @file ProductFormDialog.tsx
 * @description Modal form dialog used for both **creating** and **editing** a
 * product in the admin panel.  The dialog is controlled — its open/close state
 * is owned by the parent component.  All form state (`formData`, `galleryUrls`)
 * is also lifted to the parent so that the dialog can be reset cleanly without
 * destroying its data prematurely.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Sections inside the form
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Name + Category        (2-col grid)
 *  2. Price + Sale Price + Stock (3-col grid, all numeric)
 *  3. Product Image          (ImageUpload component OR raw URL input)
 *  4. Gallery Images         (GalleryImageUpload — multi-image)
 *  5. Description            (Textarea, 3 rows)
 *  6. Sizes + Colors         (comma-separated string inputs, split on save)
 *  7. Material + Video       (text + VideoUpload component OR raw URL input)
 *  8. Featured toggle        (Switch)
 *  9. Cancel / Submit        (right-aligned buttons)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Bilingual notes
 * ────────────────────────────────────────────────────────────────────────────
 *  Some labels in this dialog are in English (because the product data model
 *  is English-centric) while gallery and video labels are in Bengali to match
 *  the rest of the admin UI patterns.
 *  গ্যালারি ইমেজ এবং ভিডিও লেবেল বাংলায় লেখা হয়েছে।
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Data flow
 * ────────────────────────────────────────────────────────────────────────────
 *  Parent keeps `formData` and `galleryUrls` in state.
 *  Every `<Input>` / `<Textarea>` / `<Switch>` calls `setFormData` with an
 *  updated spread of the previous value — single source of truth in the parent.
 *  `onSubmit` is the form's submit handler; it calls the parent's mutation.
 *
 * বাংলা নোট:
 *  ফর্মের সব স্টেট প্যারেন্ট কম্পোনেন্টে থাকে।  এখানে কোনো `useState` নেই।
 *  "Save" করলে `onSubmit` কলব্যাক প্যারেন্টে যায়, যেখানে Supabase মিউটেশন হয়।
 *
 * @module ProductFormDialog
 */

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/admin/ImageUpload";
import GalleryImageUpload from "@/components/admin/GalleryImageUpload";
import VideoUpload from "@/components/admin/VideoUpload";
import type { AdminProduct, AdminProductInput } from "@/lib/admin/productHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link ProductFormDialog}.
 *
 * @interface Props
 *
 * @property {boolean} open
 *   Controls dialog visibility.  When `false` the dialog is unmounted.
 *   বাংলা: `true` হলে ডায়ালগ খোলা থাকে।
 *
 * @property {(open: boolean) => void} onOpenChange
 *   Called by the Dialog when the user requests closing (Escape key, overlay
 *   click, or the Cancel button).  The parent should set `open` to `false`.
 *   বাংলা: ডায়ালগ বন্ধ হওয়ার অনুরোধে এই কলব্যাক ডাকা হয়।
 *
 * @property {AdminProduct | null} editing
 *   When non-null the dialog title changes to "Edit Product" and the Submit
 *   button reads "Update Product".  When `null` it shows "Add New Product".
 *   বাংলা: এডিট মোডে `editing`-এ পণ্যের ডেটা থাকে; অ্যাড মোডে `null`।
 *
 * @property {AdminProductInput} formData
 *   Current form field values maintained by the parent.
 *   বাংলা: ফর্মের বর্তমান মান — প্যারেন্ট কম্পোনেন্টে `useState` দিয়ে রাখা।
 *
 * @property {(data: AdminProductInput) => void} setFormData
 *   Setter for `formData`.  Every field `onChange` spreads the previous value
 *   and updates only the changed key.
 *   বাংলা: ফর্মের যেকোনো ফিল্ড পরিবর্তনে এই ফাংশন কল হয়।
 *
 * @property {string[]} galleryUrls
 *   Array of gallery image URLs currently attached to the product.
 *   বাংলা: গ্যালারির বর্তমান ছবির URL-এর তালিকা।
 *
 * @property {(urls: string[]) => void} setGalleryUrls
 *   Setter for `galleryUrls`.  Called by GalleryImageUpload on change.
 *   বাংলা: গ্যালারি ছবি পরিবর্তনে কল হয়।
 *
 * @property {(e: React.FormEvent) => void} onSubmit
 *   Native form submit handler.  The parent calls `e.preventDefault()` and
 *   runs the Supabase insert/update mutation.
 *   বাংলা: ফর্ম সাবমিটে এই কলব্যাক ডাকা হয়; Supabase মিউটেশন এখানে হয়।
 *
 * @property {boolean} [submitting]
 *   Optional.  When `true` the Submit button is disabled to prevent
 *   double-submission while the mutation is in flight.
 *   বাংলা: `true` হলে সাবমিট বাটন নিষ্ক্রিয় — মিউটেশন চলাকালীন।
 */
interface Props {
  /** Controlled open state. বাংলা: ডায়ালগ খোলা/বন্ধ নিয়ন্ত্রণ। */
  open: boolean;
  /** Called when the dialog should close. বাংলা: ডায়ালগ বন্ধ কলব্যাক। */
  onOpenChange: (open: boolean) => void;
  /** Non-null when editing an existing product; null when adding. বাংলা: এডিট মোডে পণ্যের ডেটা। */
  editing: AdminProduct | null;
  /** Current controlled form field values. বাংলা: ফর্মের বর্তমান মান। */
  formData: AdminProductInput;
  /** Setter for all form fields. বাংলা: ফর্ম আপডেটের সেটার। */
  setFormData: (data: AdminProductInput) => void;
  /** Gallery image URL list for the current product. বাংলা: গ্যালারি ছবির URL তালিকা। */
  galleryUrls: string[];
  /** Setter for gallery URL list. বাংলা: গ্যালারি আপডেটের সেটার। */
  setGalleryUrls: (urls: string[]) => void;
  /** Form submit handler (called with the native FormEvent). বাংলা: ফর্ম সাবমিট হ্যান্ডলার। */
  onSubmit: (e: React.FormEvent) => void;
  /** Disables submit while a Supabase mutation is pending. বাংলা: মিউটেশন চলাকালীন সাবমিট বন্ধ। */
  submitting?: boolean;
  /** Category autocomplete suggestions sourced from existing products. */
  categorySuggestions?: string[];
  /** Subcategory autocomplete suggestions, filtered by selected category upstream. */
  subcategorySuggestions?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ProductFormDialog` — dual-purpose modal for adding and editing products.
 *
 * The dialog content is scrollable (`overflow-y-auto`) with a max-height of
 * 90 vh so it stays fully usable on short screens.  Maximum width is `2xl`
 * (672 px) to comfortably accommodate the two-column grids.
 *
 * ### Edit vs Add mode
 * The `editing` prop drives all copy differences:
 * - Dialog title: "Edit Product" vs "Add New Product"
 * - Submit button: "Update Product" vs "Create Product"
 *
 * ### Sizes & Colors encoding
 * Both fields are stored as `string[]` in the DB but presented as a single
 * comma-separated input for simplicity.  On every keystroke the value is
 * split on commas and trimmed before being stored in `formData`.
 *
 * ### Image and Video fields
 * Each media type provides **two** input methods: a drag-and-drop upload
 * component AND a plain text URL input.  Both write to the same field
 * (`image_url` / `video_url`) so the last change wins.
 *
 * @param {Props} props – See {@link Props}.
 * @returns {JSX.Element} A shadcn `<Dialog>` with a controlled form inside.
 *
 * বাংলা নোট:
 *  সাইজ এবং কালার ইনপুটে কমা দিয়ে আলাদা করতে হবে।
 *  উদাহরণ: '52", 54", 56"' অথবা 'Black, White, Navy'
 *  ড্রপ-আপলোড কম্পোনেন্ট বা URL সরাসরি পেস্ট করা দুটোই কাজ করে।
 */
export default function ProductFormDialog({
  open,
  onOpenChange,
  editing,
  formData,
  setFormData,
  galleryUrls,
  setGalleryUrls,
  onSubmit,
  submitting,
}: Props) {
  return (
    /**
     * Shadcn `<Dialog>` — controlled via `open` / `onOpenChange`.
     * Closing via Escape, overlay click, or the Cancel button all call
     * `onOpenChange(false)` which the parent handles.
     * বাংলা: Dialog নিয়ন্ত্রিত (controlled) — প্যারেন্টের open স্টেট দিয়ে।
     */
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * max-w-2xl  → dialog capped at 672 px on wide screens
       * max-h-[90vh] + overflow-y-auto → scrollable content on short screens
       * বাংলা: ডায়ালগ স্ক্রোলযোগ্য, ছোট স্ক্রিনেও পুরো ফর্ম দেখা যাবে।
       */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/*
           * Title switches between Add and Edit mode based on `editing` prop.
           * বাংলা: `editing` থাকলে "Edit Product", না থাকলে "Add New Product"।
           */}
          <DialogTitle>{editing ? "Edit Product" : "Add New Product"}</DialogTitle>
        </DialogHeader>

        {/* ── Main form ─────────────────────────────────────────────────── */}
        <form onSubmit={onSubmit} className="space-y-4">

          {/* ── Section 1: Name + Category (2-col) ───────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {/* Product name — required field. বাংলা: পণ্যের নাম, আবশ্যক। */}
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              {/* Category — required; used for filtering in ProductsFilters. বাংলা: ক্যাটাগরি, আবশ্যক। */}
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              />
            </div>
          </div>

          {/* ── Section 2: Price + Sale Price + Stock (3-col) ────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              {/*
               * Regular price in BDT (৳).  Required.
               * Stored as a numeric value; the ৳ symbol is display-only.
               * বাংলা: নিয়মিত মূল্য (টাকায়), আবশ্যক।
               */}
              <Label htmlFor="price">Price (৳)</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2">
              {/*
               * Optional discounted sale price.  Null when the product has no
               * active sale.  Shown as a strikethrough beside sale price in table.
               * বাংলা: সেল প্রাইস ঐচ্ছিক; খালি রাখলে null হয়।
               */}
              <Label htmlFor="sale_price">Sale Price (৳)</Label>
              <Input
                id="sale_price"
                type="number"
                value={formData.sale_price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sale_price: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              {/*
               * Current stock quantity.  Used for low-stock badge logic
               * (`stock <= LOW_STOCK_THRESHOLD`) in ProductsTable.
               * বাংলা: স্টক পরিমাণ; কম হলে ProductsTable-এ সতর্কতা দেখায়।
               */}
              <Label htmlFor="stock">Stock</Label>
              <Input
                id="stock"
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* ── Section 3: Product Image ──────────────────────────────── */}
          <div className="space-y-2">
            <Label>Product Image</Label>
            {/*
             * ImageUpload: drag-and-drop / file picker that uploads to Supabase
             * Storage and returns the public URL.
             * বাংলা: ইমেজ আপলোড কম্পোনেন্ট — ড্র্যাগ-ড্রপ বা ফাইল পিকার।
             */}
            <ImageUpload
              value={formData.image_url || ""}
              onChange={(url) => setFormData({ ...formData, image_url: url })}
            />
            {/* Alternative: paste a raw URL directly. বাংলা: সরাসরি URL পেস্ট করার বিকল্প। */}
            <p className="text-xs text-muted-foreground">Or paste an image URL:</p>
            <Input
              id="image_url"
              placeholder="https://example.com/image.jpg"
              value={formData.image_url || ""}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
          </div>

          {/* ── Section 4: Gallery Images ─────────────────────────────── */}
          <div className="space-y-2">
            {/*
             * Bengali label: "গ্যালারি ইমেজ (একাধিক ছবি যুক্ত করুন)"
             * Translation: "Gallery Images (add multiple photos)"
             * Managed by GalleryImageUpload which handles ordering and deletion.
             * বাংলা: একাধিক গ্যালারি ছবি যুক্ত করা যাবে এই সেকশনে।
             */}
            <Label>গ্যালারি ইমেজ (একাধিক ছবি যুক্ত করুন)</Label>
            <GalleryImageUpload images={galleryUrls} onChange={setGalleryUrls} />
          </div>

          {/* ── Section 5: Description ────────────────────────────────── */}
          <div className="space-y-2">
            {/* Long-form product description. Optional. বাংলা: পণ্যের বিবরণ, ঐচ্ছিক। */}
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* ── Section 6: Sizes + Colors (2-col) ────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {/*
               * Comma-separated size list.  Displayed as a single string in the
               * input, split into string[] on every keystroke and stored in
               * `formData.sizes`.
               * বাংলা: কমা দিয়ে সাইজ লিখুন; স্বয়ংক্রিয়ভাবে তালিকায় পরিণত হবে।
               * Example: '52", 54", 56", 58", 60"'
               */}
              <Label htmlFor="sizes">Sizes (comma-separated)</Label>
              <Input
                id="sizes"
                value={formData.sizes?.join(", ") || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sizes: e.target.value.split(",").map((s) => s.trim()),
                  })
                }
                placeholder='52", 54", 56", 58", 60"'
              />
            </div>
            <div className="space-y-2">
              {/*
               * Comma-separated color list.  Same split/join pattern as sizes.
               * বাংলা: কমা দিয়ে রঙের নাম লিখুন।
               * Example: 'Black, White, Navy'
               */}
              <Label htmlFor="colors">Colors (comma-separated)</Label>
              <Input
                id="colors"
                value={formData.colors?.join(", ") || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    colors: e.target.value.split(",").map((c) => c.trim()),
                  })
                }
                placeholder="Black, White, Navy"
              />
            </div>
          </div>

          {/* ── Section 7: Fabric + Video (2-col) ─────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fabric">Fabric</Label>
              <Input
                id="fabric"
                value={formData.fabric || ""}
                onChange={(e) =>
                  setFormData({ ...formData, fabric: e.target.value, material: e.target.value })
                }
                placeholder="Nida, Barbie, Chiffon, Crepe..."
              />
            </div>
            <div className="space-y-2">
              <Label>প্রোডাক্ট ভিডিও</Label>
              <VideoUpload
                value={formData.video_url || ""}
                onChange={(url) => setFormData({ ...formData, video_url: url })}
              />
              <p className="text-xs text-muted-foreground">অথবা ভিডিও URL পেস্ট করুন:</p>
              <Input
                id="video_url"
                placeholder="https://example.com/video.mp4"
                value={formData.video_url || ""}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
              />
            </div>
          </div>

          {/* ── Section 7b: Product Field Standard ───────────────────
               SKU, Subcategory, Work Type, Part, Hijab/Inner included,
               Purchase Cost (internal), and computed Margin preview. */}
          <div className="rounded-lg border border-border/60 p-4 space-y-4 bg-muted/20">
            <p className="text-sm font-semibold">Product Field Standard</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={formData.sku || ""}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="DBH-ABY-1001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subcategory">Subcategory</Label>
                <Input
                  id="subcategory"
                  value={formData.subcategory || ""}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  placeholder="Farasha / Open Abaya / Borka"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="work_type">Work Type</Label>
                <Input
                  id="work_type"
                  value={formData.work_type || ""}
                  onChange={(e) => setFormData({ ...formData, work_type: e.target.value })}
                  placeholder="Embroidery / Karchupi / Stone / Beaded"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part">Part</Label>
                <Input
                  id="part"
                  value={formData.part || ""}
                  onChange={(e) => setFormData({ ...formData, part: e.target.value })}
                  placeholder="1 Part / 2 Part / 3 Part"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="hijab_included"
                  checked={formData.hijab_included}
                  onCheckedChange={(v) => setFormData({ ...formData, hijab_included: v })}
                />
                <Label htmlFor="hijab_included">Hijab Included</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="inner_included"
                  checked={formData.inner_included}
                  onCheckedChange={(v) => setFormData({ ...formData, inner_included: v })}
                />
                <Label htmlFor="inner_included">Inner Included</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchase_cost">Purchase Cost (৳) — internal only</Label>
                <Input
                  id="purchase_cost"
                  type="number"
                  value={formData.purchase_cost ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      purchase_cost: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Margin (auto)</Label>
                <div className="input-luxury flex items-center px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground">
                  ৳{(
                    ((formData.sale_price ?? formData.price) || 0) -
                    (formData.purchase_cost ?? 0)
                  ).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 7c: SEO fields ─────────────────────────────── */}
          <div className="rounded-lg border border-border/60 p-4 space-y-4 bg-muted/20">
            <p className="text-sm font-semibold">SEO & Accessibility</p>
            <div className="space-y-2">
              <Label htmlFor="image_alt_text">Image Alt Text</Label>
              <Input
                id="image_alt_text"
                value={formData.image_alt_text || ""}
                onChange={(e) => setFormData({ ...formData, image_alt_text: e.target.value })}
                placeholder="Dubai Imported Black Karchupi Abaya"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta_title">Meta Title</Label>
              <Input
                id="meta_title"
                value={formData.meta_title || ""}
                onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                maxLength={70}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta_description">Meta Description</Label>
              <Textarea
                id="meta_description"
                rows={2}
                value={formData.meta_description || ""}
                onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                maxLength={170}
              />
            </div>
          </div>

          {/* ── Section 8: Featured toggle ───────────────────────────── */}
          <div className="flex items-center gap-2">
            <Switch
              id="featured"
              checked={formData.featured}
              onCheckedChange={(checked) => setFormData({ ...formData, featured: checked })}
            />
            <Label htmlFor="featured">Featured Product</Label>
          </div>


          {/* ── Section 9: Form action buttons ──────────────────────── */}
          <div className="flex justify-end gap-2">
            {/*
             * Cancel — calls `onOpenChange(false)` to close without saving.
             * type="button" prevents accidental form submission.
             * বাংলা: বাতিল করলে ডায়ালগ বন্ধ হবে, কোনো পরিবর্তন সেভ হবে না।
             */}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {/*
             * Submit — disabled while `submitting` to prevent double-submission.
             * Label changes between "Create Product" and "Update Product".
             * বাংলা: সাবমিটে মিউটেশন চলাকালীন বাটন নিষ্ক্রিয় থাকে।
             */}
            <Button type="submit" disabled={submitting}>
              {editing ? "Update" : "Create"} Product
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
