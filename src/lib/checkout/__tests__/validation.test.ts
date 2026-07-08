import { describe, it, expect } from "vitest";
import { validateCheckoutFields } from "../validation";

const base = { fullName: "", phone: "", address: "" };

describe("validateCheckoutFields", () => {
  it("flags every required field when empty", () => {
    const errs = validateCheckoutFields(base);
    expect(errs.fullName).toMatch(/নাম দিন/);
    expect(errs.phone).toMatch(/মোবাইল/);
    expect(errs.address).toMatch(/পুরো ঠিকানা/);
  });

  it("rejects a name shorter than 3 chars", () => {
    const errs = validateCheckoutFields({ ...base, fullName: "Ab", phone: "01712345678", address: "123 Main Road, Dhaka" });
    expect(errs.fullName).toMatch(/৩ অক্ষর/);
  });

  it("rejects non-BD phone formats", () => {
    const errs = validateCheckoutFields({ ...base, fullName: "Rakib Ahmed", phone: "0212345678", address: "123 Main Road, Dhaka" });
    expect(errs.phone).toBeDefined();
  });

  it("rejects short phone numbers", () => {
    const errs = validateCheckoutFields({ ...base, fullName: "Rakib Ahmed", phone: "01712", address: "123 Main Road, Dhaka" });
    expect(errs.phone).toMatch(/১১ সংখ্যা/);
  });

  it("rejects addresses shorter than 10 chars", () => {
    const errs = validateCheckoutFields({ ...base, fullName: "Rakib Ahmed", phone: "01712345678", address: "Short" });
    expect(errs.address).toMatch(/১০ অক্ষর/);
  });

  it("passes for a fully valid entry", () => {
    const errs = validateCheckoutFields({
      fullName: "Rakib Ahmed",
      phone: "01712345678",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
    });
    expect(errs).toEqual({});
  });

  it("accepts phones with +88 prefix or spaces", () => {
    const errs = validateCheckoutFields({
      fullName: "Rakib Ahmed",
      phone: "+880 1712-345678",
      address: "House 12, Road 5, Dhanmondi",
    });
    expect(errs.phone).toBeUndefined();
  });
});
