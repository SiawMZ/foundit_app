// Permanently deletes the calling user: their thumbnails, then the auth user.
// Links and folders go with it (on delete cascade).
// POST with the user's Authorization header.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return json({ error: 'missing authorization' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not signed in' }, 401);
  const userId = data.user.id;

  try {
    // Thumbnails live under {user_id}/ in the thumbnails bucket. Files that other people's links still
    // use (links this user added to a shared folder, or copies) are kept.
    const { data: shared, error: sharedError } = await admin
      .from('links')
      .select('thumbnail_path')
      .like('thumbnail_path', `${userId}/%`)
      .neq('user_id', userId);
    if (sharedError) throw sharedError;
    const keep = new Set((shared ?? []).map((r) => r.thumbnail_path as string));
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error: listError } = await admin.storage
        .from('thumbnails')
        .list(userId, { limit: 1000, offset });
      if (listError) throw listError;
      if (!files?.length) break;
      const remove = files.map((f) => `${userId}/${f.name}`).filter((p) => !keep.has(p));
      if (remove.length) {
        const { error: removeError } = await admin.storage.from('thumbnails').remove(remove);
        if (removeError) throw removeError;
        // Removed files shift the listing; kept ones stay, so page past them.
        offset -= remove.length;
      }
      if (files.length < 1000) break;
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('delete-account failed', userId, message);
    // Nothing is lost on a partial failure: thumbnails can be fetched again and the account remains.
    return json({ error: 'Could not delete the account. Please try again.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
