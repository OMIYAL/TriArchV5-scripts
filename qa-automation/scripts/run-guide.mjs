/**
 * Runs storefront BDD specs headed with Mimik extension loading enabled.
 * Requires MIMIK_EXTENSION_PATH in .env (unpacked Mimik folder with manifest.json).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

process.env.MIMIK_GUIDE = '1';

if (!process.env.MIMIK_EXTENSION_PATH?.trim()) {
  console.error(
    'Missing MIMIK_EXTENSION_PATH. Set it in qa-automation/.env to your unpacked Mimik build (folder containing manifest.json).',
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const result = spawnSync(
  'npx',
  ['playwright', 'test', '--project=guide-mimik', '--headed', ...extraArgs],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  },
);

process.exit(result.status ?? 1);
