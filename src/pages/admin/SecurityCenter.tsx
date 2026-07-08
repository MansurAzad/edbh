import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Play, Download, AlertTriangle, CheckCircle2, RefreshCw, Bug, FileWarning } from "lucide-react";

type ScanFinding = {
  table?: string; column?: string; row_id?: string;
  pattern?: string; severity?: "critical" | "warn"; excerpt?: string;
  error?: string;
};

type ScanReport = {
  id: string;
  created_at: string;
  triggered_by: string;
  total_findings: number;
  critical_count: number;
  duration_ms: number | null;
  findings: { items: ScanFinding[]; recent_blocks: any[] } | any;
};

function downloadJson(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function SecurityCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("scans");

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ["security-scan-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_scan_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ScanReport[];
    },
  });

  const { data: cspReports = [] } = useQuery({
    queryKey: ["csp-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("csp_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: blockLogs = [] } = useQuery({
    queryKey: ["injection-block-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("injection_block_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  const runScan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("security-scan", {
        body: { triggered_by: "manual" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Scan completed");
      qc.invalidateQueries({ queryKey: ["security-scan-reports"] });
      qc.invalidateQueries({ queryKey: ["injection-block-log"] });
    },
    onError: (e: any) => toast.error(`Scan failed: ${e.message ?? e}`),
  });

  const latest = reports[0];
  const summary = useMemo(() => {
    if (!latest) return null;
    return {
      total: latest.total_findings,
      critical: latest.critical_count,
      at: new Date(latest.created_at).toLocaleString(),
    };
  }, [latest]);

  return (
    <AdminLayout>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Security Center</h1>
              <p className="text-sm text-muted-foreground">
                Injection scans, CSP violation reports, and blocked-write logs.
              </p>
            </div>
          </div>
          <Button onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run scan now
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Latest scan</CardDescription>
              <CardTitle className="text-xl">{summary ? summary.at : "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {summary ? `${summary.total} findings, ${summary.critical} critical` : "No scans yet"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>CSP violations (all-time)</CardDescription>
              <CardTitle className="text-xl">{cspReports.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Browser-reported blocked resources
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Injection blocks</CardDescription>
              <CardTitle className="text-xl">{blockLogs.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Rejected writes and uploads
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="scans"><Bug className="mr-2 h-4 w-4" />Scans</TabsTrigger>
            <TabsTrigger value="blocks"><FileWarning className="mr-2 h-4 w-4" />Blocks</TabsTrigger>
            <TabsTrigger value="csp"><AlertTriangle className="mr-2 h-4 w-4" />CSP reports</TabsTrigger>
          </TabsList>

          <TabsContent value="scans" className="space-y-3">
            {loadingReports && <div className="text-sm">Loading…</div>}
            {reports.map((r) => {
              const items: ScanFinding[] = r.findings?.items ?? [];
              return (
                <Card key={r.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base">
                        {new Date(r.created_at).toLocaleString()}{" "}
                        <Badge variant="outline" className="ml-2">{r.triggered_by}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {r.total_findings} findings · {r.critical_count} critical · {r.duration_ms ?? 0}ms
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {r.critical_count === 0 ? (
                        <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Clean</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />{r.critical_count}
                        </Badge>
                      )}
                      <Button size="sm" variant="outline" onClick={() => downloadJson(`scan-${r.id}.json`, r)}>
                        <Download className="mr-2 h-3 w-3" />JSON
                      </Button>
                    </div>
                  </CardHeader>
                  {items.length > 0 && (
                    <CardContent>
                      <div className="max-h-64 overflow-auto rounded border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-2 text-left">Severity</th>
                              <th className="p-2 text-left">Table.Column</th>
                              <th className="p-2 text-left">Pattern</th>
                              <th className="p-2 text-left">Excerpt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.slice(0, 100).map((f, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2">
                                  <Badge variant={f.severity === "critical" ? "destructive" : "outline"}>
                                    {f.severity}
                                  </Badge>
                                </td>
                                <td className="p-2 font-mono">{f.table}.{f.column}</td>
                                <td className="p-2 font-mono">{f.pattern}</td>
                                <td className="p-2 max-w-md truncate" title={f.excerpt}>{f.excerpt}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {reports.length === 0 && !loadingReports && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                No scans yet. Click "Run scan now" to trigger one.
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="blocks">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Injection blocks ({blockLogs.length})</CardTitle>
                <Button size="sm" variant="outline"
                  onClick={() => downloadJson(`injection-blocks-${Date.now()}.json`, blockLogs)}>
                  <Download className="mr-2 h-3 w-3" />Download log
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-[520px] overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">When</th>
                        <th className="p-2 text-left">Source</th>
                        <th className="p-2 text-left">Reason</th>
                        <th className="p-2 text-left">Pattern</th>
                        <th className="p-2 text-left">Excerpt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockLogs.map((b) => (
                        <tr key={b.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                          <td className="p-2 font-mono">{b.source}</td>
                          <td className="p-2">{b.reason}</td>
                          <td className="p-2 font-mono">{b.matched_pattern}</td>
                          <td className="p-2 max-w-sm truncate" title={b.payload_excerpt}>{b.payload_excerpt}</td>
                        </tr>
                      ))}
                      {blockLogs.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No blocked writes 🎉</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csp">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">CSP violation reports</CardTitle>
                <Button size="sm" variant="outline"
                  onClick={() => downloadJson(`csp-reports-${Date.now()}.json`, cspReports)}>
                  <Download className="mr-2 h-3 w-3" />Download JSON
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-[520px] overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">When</th>
                        <th className="p-2 text-left">Directive</th>
                        <th className="p-2 text-left">Blocked</th>
                        <th className="p-2 text-left">Source</th>
                        <th className="p-2 text-left">Document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cspReports.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="p-2 font-mono">{r.violated_directive || r.effective_directive}</td>
                          <td className="p-2 font-mono max-w-xs truncate" title={r.blocked_uri}>{r.blocked_uri}</td>
                          <td className="p-2 font-mono max-w-xs truncate" title={r.source_file}>{r.source_file}</td>
                          <td className="p-2 max-w-xs truncate" title={r.document_uri}>{r.document_uri}</td>
                        </tr>
                      ))}
                      {cspReports.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No CSP reports yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
