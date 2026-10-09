import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The URL and publishable key are public browser configuration, not secrets.
// Never replace this key with a service_role key or a database password.
const SUPABASE_URL = "https://jkgpxyaytuahebjumtrj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uu1SVW-BqfoYEvhTRL4ZKA_pJMQiEcu";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true
  }
});
