/**
 * @file schemas.ts
 * @module lib/validation/schemas
 *
 * Centralised Zod schemas for all user-facing forms (auth, checkout, admin
 * product). Each schema carries bilingual (Bengali + English) error messages
 * so that `getFriendlyError(ZodError)` produces UI-ready strings.
 *
 * Usage:
 * ```ts
 * const result = loginSchema.safeParse(formData);
 * if (!result.success) {
 *   toast.error(getFriendlyError(result.error));
 *   return;
 * }
 * ```
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Auth                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/** Email field shared across login / signup / reset. */
const emailField = z
  .string({ required_error: "ইমেইল লিখুন / Email is required" })
  .trim()
  .min(1, "ইমেইল লিখুন / Email is required")
  .max(255, "ইমেইল অনেক লম্বা / Email is too long")
  .email("সঠিক ইমেইল লিখুন / Enter a valid email");

/** Password field for sign-in (lenient — server is source of truth). */
const passwordLogin = z
  .string({ required_error: "পাসওয়ার্ড লিখুন / Password is required" })
  .min(1, "পাসওয়ার্ড লিখুন / Password is required");

/** Password field for sign-up (enforces ≥6 chars matching Supabase default). */
const passwordSignup = z
  .string({ required_error: "পাসওয়ার্ড লিখুন / Password is required" })
  .min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর / Password must be at least 6 chars")
  .max(72, "পাসওয়ার্ড অনেক লম্বা / Password too long");

/** Bangladeshi mobile (01XXXXXXXXX) — 11 digits starting with 01. */
const bdPhone = z
  .string({ required_error: "মোবাইল নম্বর লিখুন / Phone is required" })
  .trim()
  .regex(/^01[3-9]\d{8}$/u, "সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX) / Enter a valid 11-digit BD phone");

export const loginSchema = z.object({
  email: emailField,
  password: passwordLogin,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: emailField,
  password: passwordSignup,
  fullName: z
    .string({ required_error: "পুরো নাম লিখুন / Full name is required" })
    .trim()
    .min(2, "নাম কমপক্ষে ২ অক্ষর / Name must be at least 2 chars")
    .max(100, "নাম অনেক লম্বা / Name is too long"),
  phone: bdPhone,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const resetPasswordSchema = z.object({ email: emailField });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Checkout / Shipping                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export const shippingInfoSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "নাম কমপক্ষে ২ অক্ষর / Name must be at least 2 chars")
    .max(100, "নাম অনেক লম্বা / Name too long"),
  phone: bdPhone,
  /** Email is optional for guests but, when present, must be valid. */
  email: z
    .string()
    .trim()
    .max(255)
    .email("সঠিক ইমেইল লিখুন / Enter a valid email")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .trim()
    .min(5, "সম্পূর্ণ ঠিকানা লিখুন / Enter a complete address")
    .max(500, "ঠিকানা অনেক লম্বা / Address too long"),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  district: z.string().trim().max(100).optional().or(z.literal("")),
});
export type ShippingInfoInput = z.infer<typeof shippingInfoSchema>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Admin: Product create/edit                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "পণ্যের নাম দিন / Product name required")
    .max(200, "নাম অনেক লম্বা / Name too long"),
  price: z
    .number({ invalid_type_error: "সঠিক দাম দিন / Enter a valid price" })
    .nonnegative("দাম ০ বা তার বেশি হতে হবে / Price must be ≥ 0"),
  sale_price: z
    .number()
    .nonnegative("সেল প্রাইস ০ বা তার বেশি / Sale price must be ≥ 0")
    .nullable()
    .optional(),
  stock: z
    .number()
    .int("স্টক পূর্ণসংখ্যা হতে হবে / Stock must be integer")
    .nonnegative("স্টক ০ বা তার বেশি / Stock must be ≥ 0"),
  description: z.string().max(5000).optional().or(z.literal("")),
  category_id: z.string().uuid("ক্যাটাগরি নির্বাচন করুন / Select a category").nullable().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
