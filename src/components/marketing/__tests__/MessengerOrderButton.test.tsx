import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MessengerOrderButton from "../MessengerOrderButton";

const toastMock = vi.fn();
const trackMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  toast: (args: any) => toastMock(args),
  useToast: () => ({ toast: toastMock }),
}));
vi.mock("@/lib/tracking", () => ({ trackContact: (c: string) => trackMock(c) }));

describe("MessengerOrderButton", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    toastMock.mockClear();
    trackMock.mockClear();
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("renders m.me link and Bengali label", () => {
    render(<MessengerOrderButton productName="Abaya X" price={5000} />);
    const link = screen.getByRole("link", { name: /Messenger এ অর্ডার করুন/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("m.me/dborkahouse"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("copies product details to clipboard and shows toast on click", async () => {
    render(
      <MessengerOrderButton productName="Dubai Silk Abaya" price={6500} size="M" color="Black" />
    );
    fireEvent.click(screen.getByRole("link"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Dubai Silk Abaya");
    expect(copied).toContain("৳6,500");
    expect(copied).toContain("সাইজ: M");
    expect(copied).toContain("রঙ: Black");

    expect(trackMock).toHaveBeenCalledWith("messenger");
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining("কপি") })
      )
    );
  });

  it("omits size/color lines when not provided", async () => {
    render(<MessengerOrderButton productName="Simple Borka" price={3000} />);
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).not.toContain("সাইজ:");
    expect(copied).not.toContain("রঙ:");
  });
});
