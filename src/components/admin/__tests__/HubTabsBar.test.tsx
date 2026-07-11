import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HubTabsBar from "../HubTabsBar";
import ActiveStateSummary from "../ActiveStateSummary";
import { HUB_GROUPS } from "@/lib/admin/hubGroups";

const marketing = HUB_GROUPS.find((g) => g.id === "marketing")!;
const settings = HUB_GROUPS.find((g) => g.id === "settings")!;

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<>{ui}</>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActiveStateSummary", () => {
  it("mirrors the resolver for a sectioned route", () => {
    renderAt("/admin/whatsapp-events", <ActiveStateSummary />);
    const chip = screen.getByTestId("admin-active-summary");
    expect(chip.getAttribute("data-hub")).toBe("marketing");
    expect(chip.getAttribute("data-section")).toBe("Comms");
    expect(chip.getAttribute("data-tab")).toBe("/admin/whatsapp-events");
    expect(chip).toHaveTextContent(/Marketing & Comms/);
    expect(chip).toHaveTextContent(/Comms/);
    expect(chip).toHaveTextContent(/WhatsApp Events/);
  });

  it("omits section for flat hubs", () => {
    renderAt("/admin/steadfast", <ActiveStateSummary />);
    const chip = screen.getByTestId("admin-active-summary");
    expect(chip.getAttribute("data-hub")).toBe("shipping");
    expect(chip.getAttribute("data-section")).toBe("");
  });

  it("renders nothing off-hub", () => {
    renderAt("/admin/orders", <ActiveStateSummary />);
    expect(screen.queryByTestId("admin-active-summary")).toBeNull();
  });
});

describe("HubTabsBar keyboard navigation", () => {
  it("ArrowRight/ArrowLeft/Home/End move focus across all tabs", () => {
    renderAt("/admin/email-campaigns", <HubTabsBar group={marketing} />);
    const tabs = screen.getAllByRole("tab") as HTMLAnchorElement[];
    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);

    fireEvent.keyDown(tabs[tabs.length - 1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]); // wraps

    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]); // wraps backwards
  });

  it("marks only the active tab and gives it tabIndex=0", () => {
    renderAt("/admin/backup", <HubTabsBar group={settings} />);
    const active = screen
      .getAllByRole("tab")
      .filter((el) => el.getAttribute("aria-selected") === "true");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent(/Backup & Reset/);
    expect(active[0].getAttribute("tabindex")).toBe("0");
  });

  it("roving tabindex is preserved after Home/End/Arrow navigation (focus moves, tabindex does not)", () => {
    // Landing on email-campaigns → that tab owns tabindex=0. Arrow/Home/End
    // must only move DOM focus; the "roving" tabindex=0 slot stays anchored
    // to the currently active (route-selected) tab so Tab-key users always
    // re-enter the tab list at the active tab.
    renderAt("/admin/email-campaigns", <HubTabsBar group={marketing} />);
    const tabs = screen.getAllByRole("tab") as HTMLAnchorElement[];
    const activeIdx = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    expect(activeIdx).toBe(0);

    const tabIndexes = () => tabs.map((t) => t.getAttribute("tabindex"));
    const expected = tabs.map((_, i) => (i === activeIdx ? "0" : "-1"));

    tabs[activeIdx].focus();
    fireEvent.keyDown(tabs[activeIdx], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[activeIdx + 1]);
    expect(tabIndexes()).toEqual(expected);

    fireEvent.keyDown(tabs[activeIdx + 1], { key: "End" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    expect(tabIndexes()).toEqual(expected);

    fireEvent.keyDown(tabs[tabs.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabIndexes()).toEqual(expected);

    // Exactly one tab holds tabindex=0 at all times.
    const zeros = tabIndexes().filter((v) => v === "0");
    expect(zeros).toHaveLength(1);
  });

  it("roving tabindex follows the active route after tab activation", () => {
    // Simulate landing on the newly-active route (what happens after the
    // browser navigates in response to Enter/click): the newly-active tab
    // should own tabindex=0 while all others are -1.
    const { unmount } = renderAt("/admin/email-campaigns", <HubTabsBar group={marketing} />);
    let tabs = screen.getAllByRole("tab") as HTMLAnchorElement[];
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs.slice(1).every((t) => t.getAttribute("tabindex") === "-1")).toBe(true);
    unmount();

    renderAt("/admin/whatsapp-events", <HubTabsBar group={marketing} />);
    tabs = screen.getAllByRole("tab") as HTMLAnchorElement[];
    const nowActive = tabs.find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(nowActive).toHaveTextContent(/WhatsApp Events/i);
    expect(nowActive.getAttribute("tabindex")).toBe("0");
    const zeros = tabs.filter((t) => t.getAttribute("tabindex") === "0");
    expect(zeros).toHaveLength(1);
  });
});
