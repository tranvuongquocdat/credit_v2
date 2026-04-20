/**
 * Parity test: rpc_transactions_grouped vs fetch transactions + transform (filter khớp RPC)
 *
 * Chạy: npx tsx scripts/test-rpc-transactions-queries.ts
 *
 * Mặc định khoảng ngày **2025-08-01 → 2025-08-31** (chỉ khi không đặt TEST_START_DATE và TEST_END_DATE).
 * `.env.local` giống `scripts/test-rpc-queries.ts`.
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
  env: { ...process.env, TEST_RPC_TARGET: 'transactions' },
  shell: false,
});

process.exit(r.status === null ? 1 : r.status);
