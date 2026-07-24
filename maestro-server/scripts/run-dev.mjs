import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The Vite UI owns local public Supabase configuration. The V2 façade runs in
 * a separate process and deliberately uses MAESTRO_* names, so bridge the two
 * only for the local development launcher. Explicit MAESTRO_* values always
 * win, and no private/service-role value is read or forwarded.
 */
function loadUiSupabaseConfig() {
  const envPath = resolve(import.meta.dirname, '../../maestro-ui/.env.local');
  if (!existsSync(envPath)) return {};

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 0) return ['', ''];
        const key = line.slice(0, separator).trim();
        const raw = line.slice(separator + 1).trim();
        return [key, raw.replace(/^(['"])(.*)\1$/, '$2')];
      })
      .filter(([key]) => key === 'VITE_SUPABASE_URL' || key === 'VITE_SUPABASE_PUBLISHABLE_KEY' || key === 'MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS'),
  );
}

const ui = loadUiSupabaseConfig();
const env = {
  ...process.env,
  MAESTRO_SUPABASE_URL: ui.VITE_SUPABASE_URL || process.env.MAESTRO_SUPABASE_URL,
  MAESTRO_SUPABASE_PUBLISHABLE_KEY: ui.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.MAESTRO_SUPABASE_PUBLISHABLE_KEY,
  MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS: ui.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS || process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS,
};

const command = process.platform === 'win32' ? 'bun.exe' : 'bun';
const child = spawn(command, ['run', 'dev'], { cwd: resolve(import.meta.dirname, '..'), env, stdio: 'inherit' });
child.on('exit', (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
