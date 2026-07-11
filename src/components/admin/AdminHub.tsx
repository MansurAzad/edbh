/**
 * AdminHub — a tabbed container that embeds existing admin sub-pages via iframe.
 * Sub-pages are loaded with `?embed=1` so their internal <AdminLayout> renders
 * children only (no nested sidebar). Selected tab is synced to `?tab=` in URL,
 * so refreshing or sharing the link restores the same tab.
 *
 * UX: while the iframe is loading, a skeleton overlay is shown; the iframe
 * fades in when ready. Tab-switch remounts the iframe (via `key`) so the
 * transition feels crisp instead of janky in-place navigation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [loaded, setLoaded] = useState(false);
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

  // Reset loaded whenever the embedded src changes so the skeleton shows again.
  useEffect(() => {
    setLoaded(false);
  }, [currentTab?.id]);

  const handleChange = (id: string) => {
    if (id === active) return;
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
          <TabsList
            role="tablist"
            aria-label={`${title} sections`}
            className="flex flex-wrap h-auto justify-start gap-1 bg-muted/50 p-1"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                data-hub-tab={t.id}
                className="text-xs md:text-sm data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div
          className="relative rounded-lg border border-border bg-background overflow-hidden"
          data-hub-panel={currentTab?.id}
        >
          {!loaded && (
            <div
              className="absolute inset-0 z-10 p-4 md:p-6 space-y-3 bg-background animate-fade-in"
              aria-hidden="true"
              data-hub-loading="true"
            >
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          )}
          {tabs.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No sections available.
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              key={src /* remount when tab changes for a clean transition */}
              src={src}
              title={currentTab?.label}
              onLoad={() => setLoaded(true)}
              className={`w-full block transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              style={{ height: "calc(100dvh - 220px)", minHeight: 600, border: 0 }}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
