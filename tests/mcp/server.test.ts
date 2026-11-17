import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { NotFoundError } from '@/lib/errors';
import { assertSafeStore, createMcpServer, toolErrorText } from '@/mcp/server';

const ALLOWED = [
  'discover_jobs',
  'funnel_metrics',
  'get_job',
  'get_status',
  'list_inbox',
  'list_jobs',
  'skip_job',
  'start_run',
];

let sql: Sql;
let client: Client;
beforeEach(async () => {
  sql = await createTestDb();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(sql).connect(serverSide);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
});
afterEach(async () => {
  await client.close();
});

const text = (res: unknown): string => (res as { content: Array<{ text: string }> }).content[0].text;

describe('MCP server', () => {
  it('exposes exactly the eight allowed tools and no approve/send/settings tool', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(ALLOWED);
    for (const forbidden of ['resolve_inbox', 'approve', 'send_email', 'update_settings', 'move_application']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('get_status returns JSON with byStatus', async () => {
    const res = await client.callTool({ name: 'get_status', arguments: {} });
    expect(JSON.parse(text(res)).byStatus).toBeDefined();
  });

  it('a handler error becomes an isError result without a stack trace', async () => {
    const res = await client.callTool({ name: 'skip_job', arguments: { id: 'nope', reason: 'other' } });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(text(res)).toMatch(/not found/i);
    expect(text(res)).not.toMatch(/\bat .*\.(ts|js):\d+/);
  });
});

describe('toolErrorText', () => {
  it('passes through known errors and hides everything else', () => {
    expect(toolErrorText(new NotFoundError('Application not found'))).toBe('Application not found');
    expect(toolErrorText(new Error('password authentication failed for user "postgres.abc"'))).toBe('Tool failed (see the server log)');
    expect(toolErrorText('weird')).toBe('Tool failed (see the server log)');
  });
});

describe('assertSafeStore', () => {
  it('refuses the on-disk dev store unless explicitly allowed', () => {
    expect(() => assertSafeStore({ DEV_DB_DIR: '.dev-db' })).toThrow(/single-process|MCP_ALLOW_DEV_STORE/);
    expect(() => assertSafeStore({ DEV_DB_DIR: '.dev-db', MCP_ALLOW_DEV_STORE: '1' })).not.toThrow();
    expect(() => assertSafeStore({ DEV_DB_DIR: '.dev-db', DATABASE_URL: 'postgres://x' })).not.toThrow();
    expect(() => assertSafeStore({})).not.toThrow();
  });
});

describe('real stdio process', () => {
  it('lists 8 tools and keeps stdout clean protocol JSON', async () => {
    // DEV_DB_DIR must be one segment starting with .dev-db inside the project (see src/lib/devStore.ts)
    const dir = `.dev-db-mcp-test-${process.pid}`;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('node_modules/tsx/dist/cli.mjs'), 'src/mcp/main.ts'],
      cwd: process.cwd(),
      env: { MCP_ALLOW_DEV_STORE: '1', DEV_DB_DIR: dir, DATABASE_URL: '' },
      stderr: 'ignore',
    });
    const errors: unknown[] = [];
    transport.onerror = (e) => errors.push(e);
    const stdio = new Client({ name: 'smoke', version: '1.0.0' });
    try {
      await stdio.connect(transport);
      expect((await stdio.listTools()).tools).toHaveLength(8);
      expect(errors).toEqual([]);
    } finally {
      await stdio.close();
      rmSync(path.resolve(dir), { recursive: true, force: true });
    }
  }, 90_000);
});
