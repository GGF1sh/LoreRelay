import { runMcpAdapter } from './mcpAdapter';
void runMcpAdapter('player').catch(() => { process.stderr.write('LoreRelay Player connection failed.\n'); process.exit(1); });
