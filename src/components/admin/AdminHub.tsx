/**
 * AdminHub — a tabbed container that embeds existing admin sub-pages via iframe.
 * Sub-pages are loaded with `?embed=1` so their internal <AdminLayout> renders
 * children only (no nested sidebar). Selected tab is synced to `?tab=` in URL.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface HubTab {
  id: string;
  label: string;
  /** Route path to embed, e.g. `/admin/shipping` */
  path: string;
}

interface AdminHubProps {
  title: string;
  description?: string;
  tabs: HubTab[];
}

export default function AdminHub({ title, description, tabs }: AdminHubProps) {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") || tabs[0]?.id;
  const [active, setActive] = useState<string>(initial);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const q = params.get("tab");
    if (q && q !== active) setActive(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const currentTab = useMemo(
    () => tabs.find((t) => t.id === active) || tabs[0],
    [tabs, active]
  );

  const handleChange = (id: string) => {
    setActive(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const src = currentTab
    ? `${currentTab.path}${currentTab.path.includes("?") ? "&" : "?"}embed=1`
    : "";

  return (
    <AdminLayout>
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-gradient-gold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </header>

        <Tabs value={active} onValueChange={handleChange}>
          <TabsList className="flex flex-wrap h-auto justify-start gap-1 bg-muted/50 p-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs md:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <iframe
            ref={iframeRef}
            key={src /* remount when tab changes */}
            src={src}
            title={currentTab?.label}
            className="w-full block"
            style={{ height: "calc(100dvh - 220px)", minHeight: 600, border: 0 }}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
