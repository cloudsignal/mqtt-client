/**
 * Supabase Client Configuration
 * 
 * Creates and exports the Supabase client for use throughout the application.
 * 
 * Required environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY: Your Supabase anon/public key
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. " +
    "Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file."
  );
}

/**
 * Supabase client instance
 * 
 * Use this for authentication and database operations:
 * 
 * @example
 * ```ts
 * import { supabase } from "@/lib/supabase";
 * 
 * // Sign in
 * const { data, error } = await supabase.auth.signInWithPassword({
 *   email: "user@example.com",
 *   password: "password123"
 * });
 * 
 * // Get session (for CloudSignal token exchange)
 * const { data: { session } } = await supabase.auth.getSession();
 * const accessToken = session?.access_token;
 * ```
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage (browser) or cookies (SSR)
    persistSession: true,
    // Automatically refresh the token before it expires
    autoRefreshToken: true,
    // Detect session from URL (for OAuth redirects)
    detectSessionInUrl: true,
  },
});

export default supabase;
