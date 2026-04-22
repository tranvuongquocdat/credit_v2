/**
 * Chỉ chạy parity test: installment_history vs rpc_installment_history_grouped
 *
 * Chạy: npx tsx scripts/test-rpc-installment-queries.ts
 *
 * Cấu hình: `.env.local` giống `scripts/test-rpc-queries.ts` (TEST_STORE_ID, TEST_START_DATE, …)
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const script = path.join(__dirname, 'test-rpc-queries.ts');

const r = spawnSync('npx', ['tsx', script], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TEST_RPC_TARGET: 'installment' },
  shell: false,
});

process.exit(r.status === null ? 1 : r.status);
