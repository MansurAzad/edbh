// Shared CORS headers. Re-export from a single place so every function
// stays in sync if we ever need to add/remove allowed headers.
export { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export const jsonHeaders = (extra: Record<string, string> = {}) => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...(require("npm:@supabase/supabase-js@2/cors") as any).corsHeaders,
  "Content-Type": "application/json",
  ...extra,
});
