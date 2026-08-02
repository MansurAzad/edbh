import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  auditCannibalization,
  cannibalizationSummary,
  cannibalizationToCsv,
} from "@/lib/seo/cannibalization";
import {
  CATEGORY_DESCRIPTIONS,
  validateCategoryDescriptions,
} from "@/lib/seo/categoryDescriptions";
import { analyseLanguageMix } from "@/lib/seo/languageMix";
import { ALL_PAGE_COPY } from "@/lib/seo/keywordCoverage";

const sevCls = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  none: "bg-green-500/15 text-green-600 border-green-500/30",
} as const;

/** Cannibalisation + category-description + language-mix panels. */
const SeoGovernancePanels = () => {
  const [onlyRisk, setOnlyRisk] = useState(true);

  const rows = useMemo(() => auditCannibalization(), []);
  const summary = useMemo(() => cannibalizationSummary(rows), [rows]);
  const descIssues = useMemo(() => validateCategoryDescriptions(), []);

  const mixReports = useMemo(
    () =>
      ALL_PAGE_COPY.map((p) => ({
        path: p.path,
        report: analyseLanguageMix(
          [p.title, p.description, ...p.headings, ...p.visibleText].join("\n\n"),
        ),
      })).filter((r) => r.report.severity !== "ok"),
    [],
  );

  const visible = onlyRisk ? rows.filter((r) => r.severity !== "none") : rows;

  const exportCsv = () => {
    const blob = new Blob([cannibalizationToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-cannibalization-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">
            Keyword cannibalization ({summary.high} high / {summary.medium} medium)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant={onlyRisk ? "default" : "outline"} size="sm" onClick={() => setOnlyRisk((v) => !v)}>
              Risk only
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              কোনো কীওয়ার্ড একাধিক পেজে ক্যানিবালাইজ করছে না — প্রতিটি কীওয়ার্ডের একটি করে স্পষ্ট টার্গেট পেজ আছে।
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Competing</TableHead>
                  <TableHead>Suggested fix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.keyword}>
                    <TableCell className="font-medium">{r.keyword}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={sevCls[r.severity]}>
                        {r.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.owner?.path ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.competitors.map((c) => c.path).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-md">
                      <ul className="list-disc pl-4 space-y-1">
                        {r.suggestions.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Category long-form descriptions (300–500 words)</CardTitle>
          <Badge variant={descIssues.length ? "destructive" : "secondary"}>
            {descIssues.length ? `${descIssues.length} issue` : `${CATEGORY_DESCRIPTIONS.length} unique`}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {descIssues.length > 0 && (
            <ul className="text-sm space-y-1">
              {descIssues.map((i, idx) => (
                <li key={idx} className="text-destructive">
                  <span className="font-mono">{i.category}</span> — {i.message}
                </li>
              ))}
            </ul>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Words</TableHead>
                <TableHead>Blocks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CATEGORY_DESCRIPTIONS.map((d) => (
                <TableRow key={d.category}>
                  <TableCell className="font-medium">{d.category}</TableCell>
                  <TableCell className="font-mono text-xs">{d.path}</TableCell>
                  <TableCell>{d.wordCount}</TableCell>
                  <TableCell className="text-xs">
                    {d.blocks.map((b) => b.heading).join(" + ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">বাংলা ↔ English mixing warnings</CardTitle>
          <Badge variant={mixReports.length ? "destructive" : "secondary"}>
            {mixReports.length ? `${mixReports.length} page` : "No forced mixing"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {mixReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              কোনো পেজে বাংলা ও ইংরেজি কীওয়ার্ড জোর করে একই প্যারাগ্রাফে বসানো হয়নি।
            </p>
          ) : (
            mixReports.map((r) => (
              <div key={r.path} className="rounded border border-border p-3 space-y-1">
                <div className="font-mono text-xs">{r.path}</div>
                {r.report.warnings.map((w) => (
                  <p key={w.index} className="text-xs text-destructive">
                    {w.message}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">{r.report.suggestion}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default SeoGovernancePanels;
