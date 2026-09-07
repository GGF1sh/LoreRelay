import { runMcpAdapter } from './mcpAdapter';
void runMcpAdapter('companion').catch(() => { process.stderr.write('LoreRelay Companion connection failed.\n'); process.exit(1); });
