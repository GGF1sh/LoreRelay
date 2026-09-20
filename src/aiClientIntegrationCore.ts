/** Configuration generation only: never edits another application's settings or runs a shell. */
export type AiConnectionClient = 'codex' | 'claude-desktop' | 'claude-code' | 'gemini' | 'grok';

export function buildAiConnectionConfig(client: AiConnectionClient, role: 'player' | 'narrator' | 'companion',
    adapterPath: string, endpoint: string, secret: string): { format: string; text: string; destination: string } {
    const name = `lorerelay-${role}`;
    const env = { LORERELAY_AGENT_ENDPOINT: endpoint, LORERELAY_AGENT_SECRET: secret };
    if (client === 'codex' || client === 'grok') {
        // JSON basic strings have the escaping needed for these TOML string values.
        const q = JSON.stringify;
        return { format: 'toml', destination: client === 'codex' ? '~/.codex/config.toml' : '~/.grok/config.toml',
            text: `[mcp_servers.${name}]\ncommand = "node"\nargs = [${q(adapterPath)}]\n\n[mcp_servers.${name}.env]\n`
                + Object.entries(env).map(([key, value]) => `${key} = ${q(value)}`).join('\n') + '\n' };
    }
    return { format: 'json', destination: client === 'gemini' ? '~/.gemini/settings.json'
        : client === 'claude-code' ? '.mcp.json (専用接続用フォルダー)' : 'Claude Desktop の MCP 設定',
        text: JSON.stringify({ mcpServers: { [name]: { command: 'node', args: [adapterPath], env } } }, null, 2) };
}
