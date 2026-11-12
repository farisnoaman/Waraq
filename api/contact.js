import supabase from './db-client.js';
import { createHandler, q, readBody, Reply } from './_lib/http.js';
import { schemas } from './_lib/schemas.js';

export default createHandler({
  async POST(req) {
    const body = readBody(req);
    // Honeypot: real visitors never see or fill the "website" field.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return new Reply(201, { ok: true });
    }
    const input = schemas.contact.parse(body);
    await q(
      supabase.from('contact_messages').insert({
        name: input.name,
        email: input.email,
        company: input.company || null,
        phone: input.phone || null,
        subject: input.subject,
        message: input.message,
        created_at: new Date().toISOString(),
      }),
    );
    return new Reply(201, { ok: true });
  },
});
