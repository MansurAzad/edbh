/**
 * @file site-backup/index.ts
 * @description Site Backup / Restore / Reset Edge Function
 *
 * Admin-only edge function that manages full or selective backups of Supabase
 * table data. Backup files are JSON blobs stored in the `site-backups` Storage
 * bucket; metadata about each backup is recorded in `backup_history`.
 *
 * Supported Actions (passed as `action` in the JSON body)
 * ────────────────────────────────────────────────────────
 * • backup        – Dump selected (or all) tables to a JSON file in Storage.
 * • restore       – Download a backup file and re-insert rows into tables.
 * • reset         – Delete all rows from selected tables (destructive!).
 * • download      – Retrieve the raw JSON file for a given backup_id.
 * • delete_backup – Remove a backup file from Storage and its history record.
 *
 * HTTP Contract
 * ─────────────
 * Method  : POST
 * Auth    : Bearer JWT in `Authorization` header (must resolve to an admin user)
 * Body    : JSON { action, tables?, backup_id? }
 *   – tables    : string[] – subset of ALL_TABLES; omit for full backup/restore/reset
 *   – backup_id : string  – required for restore / download / delete_backup
 * Returns : JSON (action-specific shape) or error object
 *
 * Security
 * ────────
 * 1. Request must carry a valid Supabase JWT (`Authorization: Bearer <token>`).
 * 2. The resolved user must have a row in `user_roles` with `role = 'admin'`.
 * 3. The `user_roles` table itself is **never** wiped by reset to preserve admin access.
 *
 * Environment Variables
 * ─────────────────────
 * SUPABASE_URL              – Project REST endpoint.
 * SUPABASE_ANON_KEY         – Used to verify the caller's JWT.
 * SUPABASE_SERVICE_ROLE_KEY – Used for all privileged DB / Storage operations.
 *
 * বাংলা নোট
 * ─────────
 * শুধুমাত্র অ্যাডমিন ব্যবহারকারীরা এই ফাংশন কল করতে পারবে।
 * ব্যাকআপ JSON ফাইল হিসেবে Supabase Storage-এ রাখা হয়।
 * restore করার সময় পুরনো ডেটা মুছে নতুন ডেটা ঢোকানো হয়।
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard CORS headers applied to every response.
 * The wildcard origin is acceptable here because the endpoint is auth-gated.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// Table registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exhaustive list of all application tables that can be included in a backup.
 *
 * This whitelist serves two purposes:
 *  1. Prevents arbitrary table names from being passed in the `tables` body field.
 *  2. Defines the default scope of a "full" backup.
 *
 * বাংলা নোট: যে টেবিলগুলো ব্যাকআপে অন্তর্ভুক্ত হতে পারে তার তালিকা।
 * অন্য কোনো টেবিলের নাম দিলে সেটি উপেক্ষা করা হয়।
 */
const ALL_TABLES = [
  "products",
  "product_variants",
  "product_images",
  "product_reviews",
  "categories",
  "orders",
  "order_items",
  "profiles",
  "site_content",
  "coupons",
  "delivery_zones",
  "blog_posts",
  "bundle_deals",
  "newsletter_subscribers",
  "social_proof_messages",
  "referrals",
  "reward_points",
  "saved_addresses",
  "wishlist",
  "cart_items",
  "chat_histories",
  "email_campaigns",
  "customer_segments",
  "customer_segment_members",
  "staff_permissions",
  "user_roles",
  "blocked_users",
  "back_in_stock_alerts",
  "price_drop_alerts",
  "returns",
];

// ─────────────────────────────────────────────────────────────────────────────
// Main HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deno HTTP entry-point for the `site-backup` edge function.
 *
 * Authentication & authorisation flow (runs before any action):
 *  1. Reject OPTIONS requests with CORS preflight.
 *  2. Require an `Authorization` header; return 401 if absent.
 *  3. Verify the JWT via the anon Supabase client's `getUser()`.
 *  4. Check the user has `role = 'admin'` in `user_roles`; return 403 if not.
 *
 * Then dispatch to the appropriate action branch.
 *
 * বাংলা নোট: প্রথমে JWT যাচাই করে, তারপর admin রোল চেক করে,
 * তারপর action অনুযায়ী কাজ করে।
 */
Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Step 1: Require Authorization header ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Read environment credentials ──────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Step 3: Verify the caller's JWT via the anon client ───────────────────
    // We use ANON_KEY here so that the JWT is validated against the project's
    // auth, not blindly trusted.
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 4: Authorise – must be admin ─────────────────────────────────────
    // Use the service-role client for the role check to bypass RLS.
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse action payload ──────────────────────────────────────────────────
    const body = await req.json();
    const { action, tables, backup_id } = body;

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: backup
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Dumps one or more tables to a JSON file in the `site-backups` bucket.
     *
     * Algorithm:
     *  1. Determine target tables (caller-supplied list, or all tables).
     *  2. For each table, paginate in 1 000-row pages until exhausted.
     *  3. Serialise the accumulated data map as pretty-printed JSON.
     *  4. Upload the file to `site-backups/<filename>`.
     *  5. Insert a row into `backup_history` with metadata.
     *
     * বাংলা নোট: টেবিল ডেটা ১০০০ সারি করে পড়ে, সব একসাথে JSON ফাইলে
     * লিখে Storage-এ আপলোড করে।
     */
    if (action === "backup") {
      // Default to all tables if the caller didn't specify a subset
      const targetTables =
        tables && tables.length > 0 ? tables : ALL_TABLES;

      // Object that accumulates all rows keyed by table name
      const backupData: Record<string, any[]> = {};
      // Collect per-table errors without aborting the whole backup
      const errors: string[] = [];

      for (const table of targetTables) {
        // Skip any table name that isn't in the whitelist
        if (!ALL_TABLES.includes(table)) continue;

        let allRows: any[] = [];
        let from = 0;
        const pageSize = 1000; // Supabase default max rows per query

        // Paginate until we receive fewer rows than the page size
        while (true) {
          const { data, error } = await adminClient
            .from(table)
            .select("*")
            .range(from, from + pageSize - 1);

          if (error) {
            errors.push(`${table}: ${error.message}`);
            break; // Skip remaining pages for this table on error
          }
          if (!data || data.length === 0) break; // No more rows

          allRows = allRows.concat(data);

          // If we got fewer rows than the page size we've reached the end
          if (data.length < pageSize) break;
          from += pageSize;
        }

        backupData[table] = allRows;
      }

      // Build a filename from ISO timestamp with colons/dots replaced (safe for Storage keys)
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupType =
        targetTables.length === ALL_TABLES.length ? "full" : "selective";
      const fileName = `backup-${backupType}-${timestamp}.json`;

      // Serialise with indentation for readability; compute byte size for the history record
      const jsonStr = JSON.stringify(backupData, null, 2);
      const fileSizeBytes = new TextEncoder().encode(jsonStr).length;

      // ── Upload to Storage ───────────────────────────────────────────────────
      // `upsert: false` ensures we never silently overwrite an existing backup
      const { error: uploadErr } = await adminClient.storage
        .from("site-backups")
        .upload(fileName, jsonStr, {
          contentType: "application/json",
          upsert: false,
        });

      if (uploadErr) {
        return new Response(JSON.stringify({ error: uploadErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Record backup metadata in backup_history ────────────────────────────
      await adminClient.from("backup_history").insert({
        backup_name: fileName,
        backup_type: backupType,
        tables_included: targetTables,
        file_path: fileName,
        file_size_bytes: fileSizeBytes,
        status: "completed",
        created_by: user.id,
        // Store any partial-table errors as notes for debugging
        notes: errors.length > 0 ? `Errors: ${errors.join("; ")}` : null,
      });

      return new Response(
        JSON.stringify({
          success: true,
          fileName,
          tables: targetTables.length,
          // Sum of all rows across all dumped tables
          totalRows: Object.values(backupData).reduce(
            (s, a) => s + a.length,
            0,
          ),
          fileSizeBytes,
          errors,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: restore
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Restores one or more tables from a previously created backup file.
     *
     * Algorithm:
     *  1. Look up the backup record in `backup_history` by `backup_id`.
     *  2. Download the JSON file from the `site-backups` bucket.
     *  3. Determine which tables to restore (caller subset or all in the file).
     *  4. Delete existing rows in **reverse dependency order** to respect FK constraints.
     *  5. Re-insert rows in **forward dependency order** (parents first) in 500-row batches.
     *
     * ⚠️  This is a DESTRUCTIVE operation – existing rows are deleted first.
     *
     * বাংলা নোট: ব্যাকআপ ফাইল থেকে ডেটা পুনরুদ্ধার করে।
     * আগে পুরনো ডেটা মুছে, তারপর নতুন ডেটা ঢোকায়। FK ক্রম মেনে চলে।
     */
    if (action === "restore") {
      // `backup_id` is mandatory for restore
      if (!backup_id) {
        return new Response(JSON.stringify({ error: "backup_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Fetch backup metadata ───────────────────────────────────────────────
      const { data: backupRecord } = await adminClient
        .from("backup_history")
        .select("*")
        .eq("id", backup_id)
        .single();

      if (!backupRecord) {
        return new Response(JSON.stringify({ error: "Backup not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Download backup file from Storage ───────────────────────────────────
      const { data: fileData, error: dlErr } = await adminClient.storage
        .from("site-backups")
        .download(backupRecord.file_path);

      if (dlErr || !fileData) {
        return new Response(
          JSON.stringify({ error: "Failed to download backup" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Parse the JSON blob
      const backupJson = JSON.parse(await fileData.text());

      // Intersect caller-requested tables with tables present in the backup file
      const targetTables =
        tables && tables.length > 0
          ? tables.filter((t: string) => backupJson[t])
          : Object.keys(backupJson);

      // Result map: table → { deleted, restored, error? }
      const results: Record<
        string,
        { deleted: number; restored: number; error?: string }
      > = {};

      // ── Delete order: child tables first to avoid FK violations ─────────────
      // Ordered from most-dependent to least-dependent.
      const deleteOrder = [
        "order_items",
        "cart_items",
        "wishlist",
        "product_reviews",
        "product_images",
        "product_variants",
        "price_drop_alerts",
        "back_in_stock_alerts",
        "reward_points",
        "returns",
        "customer_segment_members",
        "referrals",
        "saved_addresses",
        "chat_histories",
        "orders",
        "products",
        "categories",
        "profiles",
        "site_content",
        "coupons",
        "delivery_zones",
        "blog_posts",
        "bundle_deals",
        "newsletter_subscribers",
        "social_proof_messages",
        "email_campaigns",
        "customer_segments",
        "staff_permissions",
        "user_roles",
        "blocked_users",
      ];

      // ── Insert order: parent tables first ────────────────────────────────────
      // Mirrors the delete order in reverse so FK references exist before
      // child rows are inserted.
      const insertOrder = [
        "categories",
        "products",
        "product_variants",
        "product_images",
        "profiles",
        "user_roles",
        "staff_permissions",
        "blocked_users",
        "site_content",
        "coupons",
        "delivery_zones",
        "blog_posts",
        "bundle_deals",
        "newsletter_subscribers",
        "social_proof_messages",
        "email_campaigns",
        "customer_segments",
        "customer_segment_members",
        "orders",
        "order_items",
        "cart_items",
        "wishlist",
        "product_reviews",
        "price_drop_alerts",
        "back_in_stock_alerts",
        "reward_points",
        "returns",
        "referrals",
        "saved_addresses",
        "chat_histories",
      ];

      // ── Phase 1: Delete ───────────────────────────────────────────────────────
      for (const table of deleteOrder) {
        if (!targetTables.includes(table)) continue;
        // The `.neq("id", "00000000-...")` trick satisfies PostgREST's requirement
        // that UPDATE/DELETE filters are present – effectively deletes all rows.
        const { error } = await adminClient
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          results[table] = {
            deleted: 0,
            restored: 0,
            error: `delete: ${error.message}`,
          };
        }
      }

      // ── Phase 2: Insert in 500-row batches ────────────────────────────────────
      for (const table of insertOrder) {
        if (!targetTables.includes(table) || !backupJson[table]) continue;
        const rows = backupJson[table];

        if (rows.length === 0) {
          results[table] = { deleted: 0, restored: 0 };
          continue;
        }

        let restored = 0;
        const batchSize = 500; // Smaller batch to stay within Supabase request limits
        let insertError = "";

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error } = await adminClient.from(table).insert(batch);
          if (error) {
            // Record the first error encountered; continue with next batch
            insertError = error.message;
          } else {
            restored += batch.length;
          }
        }

        results[table] = {
          deleted: rows.length,
          restored,
          ...(insertError ? { error: insertError } : {}),
        };
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: reset
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Deletes all rows from the specified (or all) tables.
     *
     * ⚠️  HIGHLY DESTRUCTIVE – data cannot be recovered unless a backup exists.
     *
     * Special case: `user_roles` is **always skipped** even if requested,
     * because wiping it would lock every user out of admin features.
     *
     * বাংলা নোট: সব ডেটা মুছে ফেলে। user_roles সবসময় বাদ দেওয়া হয়
     * যাতে অ্যাডমিন অ্যাক্সেস নষ্ট না হয়।
     */
    if (action === "reset") {
      const targetTables =
        tables && tables.length > 0 ? tables : ALL_TABLES;

      // Use the same dependency-respecting delete order as restore
      const deleteOrder = [
        "order_items",
        "cart_items",
        "wishlist",
        "product_reviews",
        "product_images",
        "product_variants",
        "price_drop_alerts",
        "back_in_stock_alerts",
        "reward_points",
        "returns",
        "customer_segment_members",
        "referrals",
        "saved_addresses",
        "chat_histories",
        "orders",
        "products",
        "categories",
        "profiles",
        "site_content",
        "coupons",
        "delivery_zones",
        "blog_posts",
        "bundle_deals",
        "newsletter_subscribers",
        "social_proof_messages",
        "email_campaigns",
        "customer_segments",
        "staff_permissions",
        "blocked_users",
      ];

      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const table of deleteOrder) {
        if (!targetTables.includes(table)) continue;

        // Hard guard: never wipe user_roles – it would remove all admin access
        if (table === "user_roles") {
          results[table] = {
            success: true,
            error: "Skipped to preserve admin access",
          };
          continue;
        }

        const { error } = await adminClient
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        results[table] = error
          ? { success: false, error: error.message }
          : { success: true };
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: download
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Streams a raw backup JSON file back to the admin with
     * a `Content-Disposition: attachment` header so browsers trigger a download.
     *
     * বাংলা নোট: ব্যাকআপ ফাইলটি সরাসরি ডাউনলোড করার জন্য পাঠায়।
     */
    if (action === "download") {
      if (!backup_id) {
        return new Response(JSON.stringify({ error: "backup_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve the file_path from the history record
      const { data: backupRecord } = await adminClient
        .from("backup_history")
        .select("*")
        .eq("id", backup_id)
        .single();

      if (!backupRecord) {
        return new Response(JSON.stringify({ error: "Backup not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Download the binary/text Blob from Storage
      const { data: fileData, error: dlErr } = await adminClient.storage
        .from("site-backups")
        .download(backupRecord.file_path);

      if (dlErr || !fileData) {
        return new Response(JSON.stringify({ error: "Download failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = await fileData.text();
      return new Response(text, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          // Forces browser to save the file rather than display it
          "Content-Disposition": `attachment; filename="${backupRecord.backup_name}"`,
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: delete_backup
    // ══════════════════════════════════════════════════════════════════════════
    /**
     * Permanently removes a backup file from the `site-backups` Storage bucket
     * and deletes its corresponding row from `backup_history`.
     *
     * If the history record no longer exists (already deleted) the function
     * returns success silently rather than erroring.
     *
     * বাংলা নোট: Storage থেকে ফাইল এবং backup_history থেকে রেকর্ড মুছে দেয়।
     */
    if (action === "delete_backup") {
      if (!backup_id) {
        return new Response(JSON.stringify({ error: "backup_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Look up the file path before deleting the history row
      const { data: backupRecord } = await adminClient
        .from("backup_history")
        .select("*")
        .eq("id", backup_id)
        .single();

      if (backupRecord) {
        // Remove the Storage object first, then clean up the history row
        await adminClient.storage
          .from("site-backups")
          .remove([backupRecord.file_path]);
        await adminClient
          .from("backup_history")
          .delete()
          .eq("id", backup_id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Unknown action ────────────────────────────────────────────────────────
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Top-level catch: unexpected runtime errors
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
