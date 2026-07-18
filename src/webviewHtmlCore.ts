export interface WebviewHtmlAssets {
    styleUri: string;
    scriptUri: string;
    mermaidUri: string;
    threeUri: string;
    genesisAssetBaseUri: string;
    cspSource: string;
    nonce: string;
}

/** Pure production HTML renderer so resource and CSP injection are testable. */
export function renderWebviewHtml(template: string, assets: WebviewHtmlAssets): string {
    const replacements: Array<[string, string]> = [
        ['{{styleUri}}', assets.styleUri],
        ['{{scriptUri}}', assets.scriptUri],
        ['{{mermaidUri}}', assets.mermaidUri],
        ['{{threeUri}}', assets.threeUri],
        ['{{genesisAssetBaseUri}}', assets.genesisAssetBaseUri],
        ['{{cspSource}}', assets.cspSource],
        ['{{nonce}}', assets.nonce],
    ];
    let html = template;
    for (const [placeholder, value] of replacements) {
        html = html.split(placeholder).join(value);
    }
    return html;
}
