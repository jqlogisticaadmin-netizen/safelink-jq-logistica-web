import { supabase } from "./supabase-client.js";

// This is a user-experience gate only. PostgreSQL RLS remains the security
// boundary and must deny unauthorized direct API requests independently.
export async function checkSafeLinkAccess(userId) {
  const profileResult = await supabase
    .from("user_profiles")
    .select("user_id,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileResult.error) {
    return { allowed: false, reason: "profile_check_failed" };
  }

  if (!profileResult.data) {
    return { allowed: false, reason: "profile_missing" };
  }

  if (profileResult.data.is_active !== true) {
    return { allowed: false, reason: "profile_inactive" };
  }

  const rolesResult = await supabase
    .from("user_roles")
    .select("role_code,organization_id")
    .eq("user_id", userId);

  if (rolesResult.error) {
    return { allowed: false, reason: "role_check_failed" };
  }

  if (!Array.isArray(rolesResult.data) || rolesResult.data.length === 0) {
    return { allowed: false, reason: "role_missing" };
  }

  return { allowed: true, roles: rolesResult.data };
}
