import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody } from './_lib/http.js';
import { getAuth, requireRole } from './_lib/auth.js';

const BUCKET = 'product-images';
const MAX_BYTES = 2 * 1024 * 1024;

/** Only these picture formats are accepted, and each has its own extension. */
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Reads the bytes of a picture and checks that they really are the picture
 * the browser said they were. The type in the request is chosen by the
 * client, so without this an HTML or SVG file could be published in the
 * bucket and opened as a page by whoever the link was sent to.
 */
function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

/** The file part of the request, whatever shape the host handed it over in. */
async function readFile(req) {
  const type = String(req.headers['content-type'] || '');
  const body = req.body;

  if (Buffer.isBuffer(body)) {
    if (!type.includes('multipart/form-data')) {
      throw new HttpError(400, 'Send the picture as multipart/form-data.');
    }
    const form = await new Response(body, { headers: { 'content-type': type } }).formData();
    const part = form.get('file');
    if (!part || typeof part === 'string') throw new HttpError(400, 'No picture was received.');
    return { buffer: Buffer.from(await part.arrayBuffer()), type: part.type, name: part.name };
  }

  // A host that parsed the form for us: the file arrives as an object.
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const part = body.file;
    if (!part) throw new HttpError(400, 'No picture was received.');
    const data = part.data ?? part.buffer ?? part.bytes;
    if (!data) throw new HttpError(400, 'The picture could not be read.');
    return {
      buffer: Buffer.isBuffer(data) ? data : Buffer.from(data),
      type: part.type ?? part.mimetype ?? '',
      name: part.filename ?? part.name ?? 'photo',
    };
  }

  throw new HttpError(400, 'No picture was received.');
}

/** The folder the picture is filed under inside the bucket. */
function safeFolder(value) {
  return value === 'category' ? 'category' : 'product';
}

export default createHandler({
  /**
   * Stores a picture and returns its public address. The catalogue keeps that
   * address in the same column it always used, so a product can point at an
   * uploaded picture or at one of the built-in ones.
   */
  async POST(req) {
    requireRole(await getAuth(req), 'admin');

    const { buffer, type } = await readFile(req);

    if (buffer.length === 0) throw new HttpError(400, 'The picture is empty.');
    if (buffer.length > MAX_BYTES) {
      throw new HttpError(413, 'The picture is larger than 2 MB. Please choose a smaller one.');
    }

    const sniffed = sniff(buffer);
    if (!sniffed || !TYPES[sniffed]) {
      throw new HttpError(415, 'Use a JPEG, PNG, WebP or AVIF picture.');
    }
    if (type && !TYPES[type]) {
      throw new HttpError(415, 'Use a JPEG, PNG, WebP or AVIF picture.');
    }

    const folder = safeFolder(req.query?.folder);
    const extension = TYPES[sniffed];
    // The name is built here, never taken from the client.
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const path = `${folder}/${name}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: sniffed, upsert: false });
    if (error) throw new HttpError(500, 'The picture could not be saved. Please try again.');

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /** Removes a picture that was replaced. */
  async DELETE(req) {
    requireRole(await getAuth(req), 'admin');

    const body = readBody(req);
    const path = String(body?.path ?? '');
    if (!/^(product|category)\/[A-Za-z0-9._-]+$/.test(path)) {
      throw new HttpError(400, 'That is not a picture address.');
    }

    await q(supabase.storage.from(BUCKET).remove([path]));
    return { ok: true };
  },
});
