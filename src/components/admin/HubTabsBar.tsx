/**
 * HubTabsBar — plain in-app tab navigation for grouped admin pages.
 * Each tab is a real <Link> that navigates to the underlying route; the
 * page renders normally inside AdminLayout (no iframes, no embed mode).
 *
 * Keyboard: focus a tab and use ArrowLeft/ArrowRight (Home/End) to move
 * focus across the flat tab list; Enter activates the focused tab.
 * Section labels are visual only — arrow navigation flows across them.
 */
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import type { HubGroup, HubTabDef } from "@/lib/admin/hubGroups";

function useTabKeyboardNav(paths: string[]) {
  const navigate = useNavigate();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);
  const onKeyDown = useCallback(
    (idx: number) => (e: React.KeyboardEvent<HTMLAnchorElement>) => {
      const last = paths.length - 1;
      let next = idx;
      if (e.key === "ArrowRight") next = idx === last ? 0 : idx + 1;
      else if (e.key === "ArrowLeft") next = idx === 0 ? last : idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigate(paths[idx]);
        return;
      } else return;
      e.preventDefault();
      refs.current[next]?.focus();
    },
    [paths, navigate],
  );
  const setRef = useCallback(
    (idx: number) => (el: HTMLAnchorElement | null) => {
      refs.current[idx] = el;
    },
    [],
  );
  return { onKeyDown, setRef };
}

function TabLink({
  tab,
  active,
  onKeyDown,
  refCb,
}: {
  tab: HubTabDef;
  active: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLAnchorElement>) => void;
  refCb: (el: HTMLAnchorElement | null) => void;
}) {
  return (
    <Link
      ref={refCb}
      to={tab.path}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onKeyDown={onKeyDown}
      data-active={active ? "true" : "false"}
      data-tab-path={tab.path}
      className={cn(
        "px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
  const flatPaths = group.tabs.map((t) => t.path);
  const { onKeyDown, setRef } = useTabKeyboardNav(flatPaths);

  const renderTab = (tab: HubTabDef) => {
    const idx = flatPaths.indexOf(tab.path);
    return (
      <TabLink
        key={tab.path}
        tab={tab}
        active={pathname === tab.path}
        onKeyDown={onKeyDown(idx)}
        refCb={setRef(idx)}
      />
    );
  };

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
              {section.tabs.map(renderTab)}
            </nav>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-4 border-b border-border" data-hub-id={group.id}>
      <nav className="flex flex-wrap gap-1" role="tablist" aria-label={`${group.title} tabs`}>
        {group.tabs.map(renderTab)}
      </nav>
    </div>
  );
}
