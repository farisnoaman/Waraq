import supabase from './db-client.js';
import { createHandler, q, readBody } from './_lib/http.js';
import { getAuth } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';

export default createHandler({
  // Returns the signed-in user's profile, creating it (as a buyer) on first sign-in.
  async GET(req) {
    const { profile } = await getAuth(req);
    return profile;
  },

  // A user may edit their own contact details. The role is never writable here.
  async PUT(req) {
    const { profile } = await getAuth(req);
    const input = schemas.profile.parse(readBody(req));
    return q(
      supabase
        .from('profiles')
        .update({
          full_name: input.full_name,
          company: input.company || null,
          phone: input.phone || null,
        })
        .eq('id', profile.id)
        .select()
        .single(),
    );
  },
});
