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
    // Thumbnails live under {user_id}/ in the thumbnails bucket.
    for (;;) {
      const { data: files, error: listError } = await admin.storage.from('thumbnails').list(userId, { limit: 1000 });
      if (listError) throw listError;
      if (!files?.length) break;
      const { error: removeError } = await admin.storage
        .from('thumbnails')
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) throw removeError;
      if (files.length < 1000) break;
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('delete-account failed', userId, message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
