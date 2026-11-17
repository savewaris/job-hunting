import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from '../../scripts/loadEnv';
import { getDb } from '@/lib/sql';
import { assertSafeStore, createMcpServer } from './server';

// Entrypoint for `npm run mcp`. stdout is the protocol channel: log to stderr only.
loadEnv();

async function main() {
  assertSafeStore(process.env);
  await createMcpServer(getDb()).connect(new StdioServerTransport());
  console.error('job-hunting MCP server ready (stdio)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
