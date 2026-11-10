import type { SupabaseClient } from '@supabase/supabase-js';

export async function verifyOrganiserAccess(supabase: SupabaseClient) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { status: 'signed-out' as const };
    // Only a server-verified identity and the database-owned allowlist grant access.
    const access = await supabase.from('icsh_organisers').select('user_id').eq('user_id', user.id).maybeSingle();
    if (access.error) return { status: 'database' as const };
    if (!access.data || access.data.user_id !== user.id) return { status: 'forbidden' as const };
    return { status: 'organiser' as const, supabase, user };
  } catch { return { status: 'unavailable' as const }; }
}
