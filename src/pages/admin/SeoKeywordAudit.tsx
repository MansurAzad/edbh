import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Search, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  ALL_PAGE_COPY,
  auditKeywordCoverage,
  coverageSummary,
  coverageToCsv,
} from "@/lib/seo/keywordCoverage";
import { validateKeywordPages } from "@/lib/seo/keywordLandingPages";
import { ALL_META, validateMeta } from "@/lib/seo/metaGenerator";
import SeoGovernancePanels from "@/components/admin/seo/SeoGovernancePanels";


const strengthMeta = {
  strong: { label: "Strong", cls: "bg-green-500/15 text-green-600 border-green-500/30" },
  partial: { label: "Partial", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  missing: { label: "Missing", cls: "bg-destructive/15 text-destructive border-destructive/30" },
} as const;

const SeoKeywordAudit = () => {
  const [search, setSearch] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const rows = useMemo(() => auditKeywordCoverage(), []);
  const summary = useMemo(() => coverageSummary(rows), [rows]);
  const issues = useMemo(() => validateKeywordPages(), []);
  const metaIssues = useMemo(() => validateMeta(), []);


  const filtered = rows.filter((r) => {
    if (onlyGaps && r.strength === "strong") return false;
    if (!search.trim()) return true;
    return r.keyword.toLowerCase().includes(search.trim().toLowerCase());
  });

  const exportCsv = () => {
    const blob = new Blob([coverageToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-keyword-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total keywords", value: summary.total, icon: Search },
            { label: "Strong (title + H1)", value: summary.strong, icon: ShieldCheck },
            { label: "Partial", value: summary.partial, icon: TriangleAlert },
            { label: "Missing", value: summary.missing, icon: XCircle },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </div>
                <div className="text-2xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">H1 ↔ Title ↔ Description consistency</CardTitle>
            <Badge variant={issues.length ? "destructive" : "secondary"}>
              {issues.length ? `${issues.length} issue` : "All pages consistent"}
            </Badge>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                প্রতিটি কীওয়ার্ড পেজের H1, title ও description-এ primary keyword যথাযথভাবে মিলে গেছে।
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                {issues.map((i, idx) => (
                  <li key={idx} className="text-destructive">
                    <span className="font-mono">/collections/{i.slug}</span> — [{i.field}] {i.message}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Auto-generated meta & OpenGraph validation</CardTitle>
            <Badge variant={metaIssues.length ? "destructive" : "secondary"}>
              {metaIssues.length ? `${metaIssues.length} issue` : `${ALL_META.length} pages valid`}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {metaIssues.length > 0 && (
              <ul className="text-sm space-y-1">
                {metaIssues.map((i, idx) => (
                  <li key={idx} className="text-destructive">
                    <span className="font-mono">{i.key}</span> — [{i.field}] {i.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead>Title (len)</TableHead>
                    <TableHead>Description (len)</TableHead>
                    <TableHead>OG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_META.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="font-mono text-xs">{m.path}</TableCell>
                      <TableCell className="text-xs">
                        {m.title} <span className="text-muted-foreground">({m.title.length})</span>
                      </TableCell>
                      <TableCell className="text-xs max-w-md">
                        <span className="line-clamp-2">{m.description}</span>
                        <span className="text-muted-foreground">({m.description.length})</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.ogTitle && m.ogDescription && m.ogImage ? "complete" : "incomplete"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>



        <SeoGovernancePanels />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Keyword → page coverage</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="কীওয়ার্ড সার্চ..."
                className="h-9 w-52"
              />
              <Button variant={onlyGaps ? "default" : "outline"} size="sm" onClick={() => setOnlyGaps((v) => !v)}>
                Gaps only
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pages &amp; fields</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.keyword}>
                    <TableCell className="font-medium">{r.keyword}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={strengthMeta[r.strength].cls}>
                        {strengthMeta[r.strength].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.hits.length === 0 ? (
                        <span className="text-destructive text-sm">কোনো পেজে নেই</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.hits.map((h) => (
                            <Link
                              key={h.path}
                              to={h.path}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs hover:border-primary"
                            >
                              {h.path}
                              <span className="text-muted-foreground">({h.fields.join(", ")})</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audited pages ({ALL_PAGE_COPY.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>H1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_PAGE_COPY.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="font-mono text-xs">{p.path}</TableCell>
                    <TableCell className="text-sm max-w-sm truncate">{p.title}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{p.headings.join(" / ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SeoKeywordAudit;
