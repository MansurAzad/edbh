/**
 * ActiveStateSummary — small breadcrumb-style chip that reflects the
 * currently-resolved hub / section / tab for the active nested route.
 * Mirrors what the sidebar + HubTabsBar highlight, so an at-a-glance
 * check (and E2E assertion) confirms the resolver is consistent.
 */
import { useLocation } from "react-router-dom";
import { findHubLocation } from "@/lib/admin/hubGroups";

export default function ActiveStateSummary() {
  const { pathname } = useLocation();
  const { group, section, tab } = findHubLocation(pathname);
  if (!group) return null;
  return (
    <div
      data-testid="admin-active-summary"
      data-hub={group.id}
      data-section={section?.label ?? ""}
      data-tab={tab?.path ?? ""}
      className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-md px-2 py-1"
    >
      <span className="font-medium text-foreground">{group.title}</span>
      {section && (
        <>
          <span aria-hidden>/</span>
          <span>{section.label}</span>
        </>
      )}
      {tab && (
        <>
          <span aria-hidden>/</span>
          <span className="text-primary font-medium">{tab.label}</span>
        </>
      )}
    </div>
  );
}
