import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings2, Plus, Trash2, Wand2 } from "lucide-react";
import type { SizeRuleSet, SizeRule } from "@/lib/admin/aiStudio/sizeRules";

const SIZE_POOL = ["Free", "50", "52", "54", "56", "58", "60", "62"];

interface Props {
  rules: SizeRuleSet;
  onChange: (r: SizeRuleSet) => void;
  onApplyAll: () => void;
}

export function RuleBuilder({ rules, onChange, onApplyAll }: Props) {
  const [open, setOpen] = useState(false);
  const [newCat, setNewCat] = useState("");

  const setRule = (path: "base" | string, rule: SizeRule) => {
    if (path === "base") onChange({ ...rules, base: rule });
    else onChange({ ...rules, overrides: { ...rules.overrides, [path]: rule } });
  };
  const removeOverride = (cat: string) => {
    const { [cat]: _, ...rest } = rules.overrides;
    onChange({ ...rules, overrides: rest });
  };

  const renderRule = (label: string, rule: SizeRule, onSet: (r: SizeRule) => void, onDelete?: () => void) => (
    <div className="border rounded-md p-3 space-y-2 bg-background">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{label}</Label>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {SIZE_POOL.map((s) => {
          const active = rule.sizes.includes(s);
          return (
            <button
              key={s}
              type="button"
              className={`px-2 py-0.5 rounded text-[11px] border ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
              onClick={() => {
                const next = active ? rule.sizes.filter((x) => x !== s) : [...rule.sizes, s];
                onSet({ ...rule, sizes: next });
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Stock/size</Label>
        <Input
          type="number"
          min={0}
          className="h-7 w-20"
          value={rule.stockPerSize}
          onChange={(e) => onSet({ ...rule, stockPerSize: Math.max(0, Number(e.target.value) || 0) })}
        />
        <span className="text-[10px] text-muted-foreground">
          → Total {rule.sizes.length * rule.stockPerSize}
        </span>
      </div>
    </div>
  );

  return (
    <Card className="p-3" data-testid="rule-builder">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Settings2 className="w-4 h-4" />
          Size & Stock Rule Builder
          <Badge variant="outline" className="text-[10px]">
            {Object.keys(rules.overrides).length} exception{Object.keys(rules.overrides).length === 1 ? "" : "s"}
          </Badge>
        </button>
        <Button size="sm" variant="outline" onClick={onApplyAll} data-testid="apply-rules-all">
          <Wand2 className="w-3.5 h-3.5 mr-1" /> Apply to all drafts
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {renderRule("Base rule (default)", rules.base, (r) => setRule("base", r))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(rules.overrides).map(([cat, r]) =>
              <div key={cat}>{renderRule(`Exception · ${cat}`, r, (nr) => setRule(cat, nr), () => removeOverride(cat))}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add category exception (e.g. Fareasha)"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              className="h-8"
            />
            <Button
              size="sm"
              onClick={() => {
                const c = newCat.trim();
                if (!c || rules.overrides[c]) return;
                setRule(c, { ...rules.base });
                setNewCat("");
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
