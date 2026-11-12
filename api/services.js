import supabase from './db-client.js';
import { createHandler, q } from './_lib/http.js';

export default createHandler({
  async GET() {
    return q(supabase.from('services').select('*').order('sort_order', { ascending: true }));
  },
});
