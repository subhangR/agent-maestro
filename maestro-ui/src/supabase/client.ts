import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getFbAuth } from '../firebase/auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

let client: SupabaseClient | null = null;
let firebaseTokenRefreshedForSupabase = false;

/**
 * Returns the shared Collab V2 data client.
 *
 * Firebase remains Maestro's identity provider. Supabase is configured with
 * Firebase Third-Party Auth and validates the current Firebase ID token before
 * Postgres RLS evaluates each query. This client deliberately does not create
 * or persist a separate Supabase Auth session.
 */
export function getCollabSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Collab V2 is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in maestro-ui/.env.local.',
    );
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: async () => {
      const user = getFbAuth().currentUser;
      if (!user) return null;

      // Existing Firebase sessions do not receive a newly assigned custom
      // role claim until refresh. Force this once per application process;
      // subsequent Supabase requests use Firebase's normal token cache.
      const forceRefresh = !firebaseTokenRefreshedForSupabase;
      firebaseTokenRefreshedForSupabase = true;
      return user.getIdToken(forceRefresh);
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
