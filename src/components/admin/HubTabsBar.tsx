/**
 * HubTabsBar — plain in-app tab navigation for grouped admin pages.
 * Each tab is a real <Link> that navigates to the underlying route; the
 * page renders normally inside AdminLayout (no iframes, no embed mode).
 *
 * When the hub group defines `sections`, tabs are rendered under labeled
 * groups instead of a single flat row.
 */
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { HubGroup, HubTabDef } from "@/lib/admin/hubGroups";

function TabLink({ tab, active }: { tab: HubTabDef; active: boolean }) {
  return (
    <Link
      to={tab.path}
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : "false"}
      className={cn(
        "px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-primary bg-primary/5"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      {tab.label}
    </Link>
  );
}

export default function HubTabsBar({ group }: { group: HubGroup }) {
  const { pathname } = useLocation();

  if (group.sections && group.sections.length > 0) {
    return (
      <div className="mb-4 space-y-2" data-hub-id={group.id}>
        {group.sections.map((section) => (
          <div key={section.label} className="border-b border-border">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground pt-1 pb-1 px-1">
              {section.label}
            </div>
            <nav
              className="flex flex-wrap gap-1"
              role="tablist"
              aria-label={`${group.title} — ${section.label}`}
            >
              {section.tabs.map((t) => (
                <TabLink key={t.path} tab={t} active={pathname === t.path} />
              ))}
            </nav>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-4 border-b border-border" data-hub-id={group.id}>
      <nav className="flex flex-wrap gap-1" role="tablist" aria-label={`${group.title} tabs`}>
        {group.tabs.map((t) => (
          <TabLink key={t.path} tab={t} active={pathname === t.path} />
        ))}
      </nav>
    </div>
  );
}
