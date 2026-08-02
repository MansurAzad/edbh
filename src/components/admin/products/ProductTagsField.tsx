import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_PRODUCT_TAGS,
  MIN_PRODUCT_TAGS,
  enforceProductTags,
} from "@/lib/seo/productTags";
import type { TaggableProduct } from "@/lib/seo/keywordTaxonomy";

interface ProductTagsFieldProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  product: TaggableProduct;
}

/**
 * Tag editor that enforces the 5–10 relevant-tag rule and surfaces
 * taxonomy-based suggestions for under-tagged products.
 */
const ProductTagsField = ({ tags, onChange, product }: ProductTagsFieldProps) => {
  const [draft, setDraft] = useState("");
  const result = useMemo(() => enforceProductTags(tags, product), [tags, product]);
  const atCap = result.tags.length >= MAX_PRODUCT_TAGS;

  const add = (tag: string) => {
    const next = enforceProductTags([...result.tags, tag], product).tags;
    onChange(next);
    setDraft("");
  };

  const remove = (tag: string) =>
    onChange(result.tags.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="product-tags">
          Tags ({MIN_PRODUCT_TAGS}–{MAX_PRODUCT_TAGS} relevant)
        </Label>
        <span
          className={
            result.status.includes("ok")
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive"
          }
        >
          {result.tags.length}/{MAX_PRODUCT_TAGS}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          id="product-tags"
          value={draft}
          disabled={atCap}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (draft.trim()) add(draft.trim());
            }
          }}
          placeholder={atCap ? "সর্বোচ্চ ১০টি ট্যাগ যোগ করা হয়েছে" : "ট্যাগ লিখে Enter চাপুন"}
        />
        <Button type="button" variant="outline" disabled={atCap || !draft.trim()} onClick={() => add(draft.trim())}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {result.messages.map((m) => (
        <p key={m} className="text-xs text-destructive">
          {m}
        </p>
      ))}

      {result.suggestions.length > 0 && !atCap && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">সাজেস্টেড ট্যাগ:</p>
          <div className="flex flex-wrap gap-1.5">
            {result.suggestions.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="cursor-pointer hover:border-primary"
                onClick={() => add(s)}
              >
                + {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductTagsField;
