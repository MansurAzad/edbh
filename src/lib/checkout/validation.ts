/**
 * @file validation.ts
 * @description Pure validation helpers for the simplified checkout form.
 * Extracted so unit tests can exercise the rules without mounting the full
 * checkout page (which pulls in cart, auth, and Supabase contexts).
 */

import type { CheckoutShippingInfo } from "@/lib/checkout/types";

export interface CheckoutFieldErrors {
  fullName?: string;
  phone?: string;
  address?: string;
}

/**
 * Validates the three required checkout fields (name, phone, address).
 * Returns an object with per-field Bengali error messages; empty object means
 * everything is valid.
 */
export function validateCheckoutFields(
  info: Pick<CheckoutShippingInfo, "fullName" | "phone" | "address">,
): CheckoutFieldErrors {
  const errs: CheckoutFieldErrors = {};

  const name = info.fullName.trim();
  if (!name) {
    errs.fullName = "নাম দিন — এটি বাধ্যতামূলক";
  } else if (name.length < 3) {
    errs.fullName = "নাম কমপক্ষে ৩ অক্ষরের হতে হবে";
  }

  const rawPhone = info.phone.trim();
  const digits = rawPhone.replace(/\D/g, "");
  if (!rawPhone) {
    errs.phone = "মোবাইল নম্বর দিন — এটি বাধ্যতামূলক";
  } else if (digits.length < 11 || digits.length > 14) {
    errs.phone = "সঠিক মোবাইল নম্বর দিন (১১ সংখ্যা, যেমন 01XXXXXXXXX)";
  } else if (!/^01[3-9]\d{8}$/.test(digits.slice(-11))) {
    errs.phone = "বাংলাদেশি মোবাইল ফরম্যাট নয় (01 দিয়ে শুরু, ১১ সংখ্যা)";
  }

  const address = info.address.trim();
  if (!address) {
    errs.address = "পুরো ঠিকানা দিন — এটি বাধ্যতামূলক";
  } else if (address.length < 10) {
    errs.address = "ঠিকানাটি সম্পূর্ণ লিখুন (কমপক্ষে ১০ অক্ষর)";
  }

  return errs;
}

export const hasErrors = (e: CheckoutFieldErrors): boolean =>
  Object.values(e).some(Boolean);
