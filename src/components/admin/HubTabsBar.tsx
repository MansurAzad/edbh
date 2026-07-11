/**
 * HubTabsBar — plain in-app tab navigation for grouped admin pages.
 * Each tab is a real <Link> that navigates to the underlying route; the
 * page renders normally inside AdminLayout (no iframes, no embed mode).
 */
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { HubGroup } from "@/lib/admin/hubGroups";

export default function HubTabsBar({ group }: { group: HubGroup }) {
  const { pathname } = useLocation();
  return (
    <div className="mb-4 border-b border-border">
      <nav className="flex flex-wrap gap-1" role="tablist" aria-label={`${group.title} tabs`}>
        {group.tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link
              key={t.path}
              to={t.path}
              role="tab"
              aria-selected={active}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
