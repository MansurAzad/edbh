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
});
