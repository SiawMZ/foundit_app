// Starts the web app against the LOCAL Supabase stack (npx supabase start),
// overriding .env.local (which points at the hosted project) for this process only.
import { execSync, spawn } from 'node:child_process';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const env = {
  ...process.env,
  EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
  EXPO_PUBLIC_SUPABASE_KEY: status.PUBLISHABLE_KEY,
};
const port = process.env.PORT || '8090';
spawn(`npx expo start --web --port ${port} --clear`, { env, stdio: 'inherit', shell: true });
