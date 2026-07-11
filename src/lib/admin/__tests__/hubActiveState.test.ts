import { describe, it, expect } from "vitest";
import { HUB_GROUPS, findHubGroupByPath } from "../hubGroups";

/**
 * Route-based active state tester.
 * For every hub member path, verify:
 *  1. `findHubGroupByPath` resolves back to the owning hub group.
 *  2. Exactly one tab in that group matches the active path.
 *  3. The hub root path also resolves to itself.
 * This is the pure-data invariant that the sidebar + HubTabsBar rely on
 * to highlight the correct sidebar entry and top tab per nested route.
 */
describe("hub active-state resolver", () => {
  it("every tab path resolves back to its hub", () => {
    for (const group of HUB_GROUPS) {
      for (const tab of group.tabs) {
        const found = findHubGroupByPath(tab.path);
        expect(found?.id, `tab ${tab.path} → hub`).toBe(group.id);
        const activeTabs = group.tabs.filter((t) => t.path === tab.path);
        expect(activeTabs).toHaveLength(1);
      }
    }
  });

  it("hub root paths resolve to their own hub", () => {
    for (const group of HUB_GROUPS) {
      expect(findHubGroupByPath(group.hubPath)?.id).toBe(group.id);
    }
  });

  it("no two hubs claim the same tab path", () => {
    const seen = new Map<string, string>();
    for (const group of HUB_GROUPS) {
      for (const tab of group.tabs) {
        expect(seen.has(tab.path), `duplicate path ${tab.path}`).toBe(false);
        seen.set(tab.path, group.id);
      }
    }
  });

  it("sectioned hubs expose their tabs identically via `tabs` and `sections`", () => {
    for (const group of HUB_GROUPS) {
      if (!group.sections) continue;
      const sectionTabs = group.sections.flatMap((s) => s.tabs.map((t) => t.path));
      const flat = group.tabs.map((t) => t.path);
      expect(sectionTabs).toEqual(flat);
    }
  });

  it("MarketingHub groups tabs into Commands / Automations / Comms", () => {
    const mkt = HUB_GROUPS.find((g) => g.id === "marketing")!;
    expect(mkt.sections?.map((s) => s.label)).toEqual([
      "Marketing Commands",
      "Marketing Automations",
      "Comms",
    ]);
    const comms = mkt.sections!.find((s) => s.label === "Comms")!;
    expect(comms.tabs.map((t) => t.path)).toContain("/admin/chat-histories");
    expect(comms.tabs.map((t) => t.path)).toContain("/admin/whatsapp-events");
  });

  it("SettingsHub groups options into Settings + Tools with correct default", () => {
    const s = HUB_GROUPS.find((g) => g.id === "settings")!;
    expect(s.sections?.map((x) => x.label)).toEqual(["Settings", "Tools"]);
    // The first tab of the first section is what the hub root redirects to.
    expect(s.sections![0].tabs[0].path).toBe(s.defaultPath);
  });
});
