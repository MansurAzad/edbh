import { useMemo, useState } from "react";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  jsonLdSummary,
  validateJsonLdPages,
  type JsonLdPageInput,
} from "@/lib/seo/jsonLdValidator";

/**
 * Pre-deploy JSON-LD validation report for every product/category/blog page.
 * Errors block rich results, warnings only weaken them.
 */
const JsonLdValidationPanel = ({ pages }: { pages: JsonLdPageInput[] }) => {
  const [onlyIssues, setOnlyIssues] = useState(true);

  const reports = useMemo(() => validateJsonLdPages(pages), [pages]);
  const summary = useMemo(() => jsonLdSummary(reports), [reports]);
  const visible = reports.filter((r) => !onlyIssues || r.issues.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4" /> JSON-LD স্কিমা ভ্যালিডেশন রিপোর্ট
        </CardTitle>
        <CardDescription>
          ডিপ্লয়ের আগে প্রতিটি product, category ও blog পেজের structured data যাচাই করুন।
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">মোট {summary.total}</Badge>
          <Badge variant={summary.errors ? "destructive" : "secondary"}>
            <XCircle className="w-3 h-3 mr-1" /> এরর {summary.errors}
          </Badge>
          <Badge variant="outline">
            <AlertTriangle className="w-3 h-3 mr-1" /> ওয়ার্নিং {summary.warnings}
          </Badge>
          <Badge variant="secondary">
            <CheckCircle2 className="w-3 h-3 mr-1" /> ক্লিন {summary.clean}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setOnlyIssues((v) => !v)}>
            {onlyIssues ? "সব পেজ দেখান" : "শুধু সমস্যাযুক্ত"}
          </Button>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            কোনো JSON-LD এরর বা ওয়ার্নিং নেই — সব স্কিমা ভ্যালিড। ✅
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((r) => (
              <li key={r.path} className="rounded-md border p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{r.label}</span>
                    <span className="block font-mono text-muted-foreground truncate">{r.path}</span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {r.errors > 0 && <Badge variant="destructive">{r.errors} error</Badge>}
                    {r.warnings > 0 && <Badge variant="outline">{r.warnings} warning</Badge>}
                    {r.issues.length === 0 && <Badge variant="secondary">ok</Badge>}
                  </span>
                </div>
                {r.issues.map((issue, i) => (
                  <p
                    key={`${issue.field}-${i}`}
                    className={issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}
                  >
                    <span className="font-mono">{issue.type}.{issue.field}</span> — {issue.message}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default JsonLdValidationPanel;
