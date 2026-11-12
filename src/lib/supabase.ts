import { createClient } from '@supabase/supabase-js';

// The browser only ever uses the public anon key, and only for authentication.
// All data access goes through the API routes, which verify the session token.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export default supabase;
