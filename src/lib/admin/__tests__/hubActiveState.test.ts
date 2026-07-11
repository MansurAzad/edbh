import { describe, it, expect } from "vitest";
import {
  HUB_GROUPS,
  findHubGroupByPath,
  findHubLocation,
} from "../hubGroups";

/**
 * Route-based active state tester. Verifies the pure-data invariants the
 * sidebar + HubTabsBar + ActiveStateSummary rely on to highlight the
 * correct sidebar entry, top tab, and section per nested route.
 */
describe("hub active-state resolver", () => {
  it("every tab path resolves back to its hub", () => {
    for (const group of HUB_GROUPS) {
      for (const tab of group.tabs) {
        const found = findHubGroupByPath(tab.path);
        expect(found?.id, `tab ${tab.path} → hub`).toBe(group.id);
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
      expect(sectionTabs).toEqual(group.tabs.map((t) => t.path));
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
    expect(comms.tabs.map((t) => t.path)).toEqual([
      "/admin/chat-histories",
      "/admin/whatsapp-events",
    ]);
  });

  it("SettingsHub groups options into Settings + Tools with correct default", () => {
    const s = HUB_GROUPS.find((g) => g.id === "settings")!;
    expect(s.sections?.map((x) => x.label)).toEqual(["Settings", "Tools"]);
    expect(s.sections![0].tabs[0].path).toBe(s.defaultPath);
  });
});

/**
 * findHubLocation must return the same {group, section, tab} triple that
 * the ActiveStateSummary chip renders. Exercised for EVERY hub member
 * path to guarantee complete coverage.
 */
describe("findHubLocation — full coverage across all hubs", () => {
  for (const group of HUB_GROUPS) {
    describe(`${group.title} (${group.id})`, () => {
      for (const tab of group.tabs) {
        it(`resolves ${tab.path} → ${group.id} / ${tab.label}`, () => {
          const loc = findHubLocation(tab.path);
          expect(loc.group?.id).toBe(group.id);
          expect(loc.tab?.path).toBe(tab.path);
          if (group.sections) {
            expect(loc.section).toBeDefined();
            expect(loc.section!.tabs.some((t) => t.path === tab.path)).toBe(true);
          } else {
            expect(loc.section).toBeUndefined();
          }
        });
      }
      it(`resolves hub root ${group.hubPath} → group only`, () => {
        const loc = findHubLocation(group.hubPath);
        expect(loc.group?.id).toBe(group.id);
        expect(loc.tab).toBeUndefined();
      });
    });
  }

  it("returns empty for non-hub admin routes", () => {
    expect(findHubLocation("/admin/orders").group).toBeUndefined();
    expect(findHubLocation("/admin").group).toBeUndefined();
  });
});

/**
 * Specific hubs must expose the routes the sidebar/E2E tests target.
 * Locks the sidebar → active hub mapping for Shipping, Tracking, and
 * the Comms section under Marketing.
 */
describe("required hub coverage", () => {
  it("Shipping hub contains all expected tabs", () => {
    const shipping = HUB_GROUPS.find((g) => g.id === "shipping")!;
    const paths = shipping.tabs.map((t) => t.path);
    for (const p of [
      "/admin/shipping",
      "/admin/delivery-zones",
      "/admin/courier-integration",
      "/admin/steadfast",
      "/admin/courier-audit",
      "/admin/returns",
    ]) {
      expect(paths, `shipping missing ${p}`).toContain(p);
      expect(findHubLocation(p).group?.id).toBe("shipping");
    }
  });

  it("Tracking hub contains all expected tabs", () => {
    for (const p of [
      "/admin/tracking-funnel",
      "/admin/tracking-audit",
      "/admin/performance",
      "/admin/meta-pixel",
      "/admin/google-analytics",
      "/admin/sgtm-setup",
      "/admin/tracking-guide",
      "/admin/seo-debug",
    ]) {
      expect(findHubLocation(p).group?.id).toBe("tracking");
    }
  });

  it("Comms (Notifications / Chat / WhatsApp) resolves to Marketing hub", () => {
    for (const p of [
      "/admin/notifications",
      "/admin/chat-histories",
      "/admin/whatsapp-events",
    ]) {
      const loc = findHubLocation(p);
      expect(loc.group?.id).toBe("marketing");
      expect(loc.section?.label).toMatch(/Commands|Comms/);
    }
  });
});
