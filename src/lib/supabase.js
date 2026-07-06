import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// flowType: 'pkce' — the app uses HashRouter (GitHub Pages has no server-side
// routing), which reads everything after "#" as the route path. Supabase's
// default implicit flow returns magic-link tokens in the URL fragment
// (#access_token=...), which collides with HashRouter's own path parsing.
// PKCE returns a "?code=" query param instead, avoiding the collision.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: "pkce" } })
  : null;

if (!supabase) {
  console.warn(
    "Supabase configuration missing (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY). Running in static read-only fallback mode."
  );
}
