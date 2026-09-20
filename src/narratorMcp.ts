import { runMcpAdapter } from './mcpAdapter';
void runMcpAdapter('narrator').catch(() => { process.stderr.write('LoreRelay Narrator connection failed.\n'); process.exit(1); });
