/** Render only an already-authorized public view. No world reads or game mutations. */
export function renderPublicGameGraphic(kind: 'world-map' | 'market-report', raw: unknown): string {
    const object = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
    const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
    const escape = (value: unknown) => String(value ?? '').slice(0, 80).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '\ufffd').replace(/[&<>"']/g,
        character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
    const label = (x: number, y: number, value: unknown, size = 16) =>
        `<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`;
    const view = object(raw);
    let body = '';
    let height = 160;
    if (kind === 'world-map') {
        const geography = object(view.geography);
        const all = list(geography.regions).filter(region => typeof region?.id === 'string');
        const regions = all.slice(0, 24);
        height = Math.max(180, 125 + Math.ceil(regions.length / 4) * 90);
        body += label(24, 32, '公開地域の接続図', 22);
        body += label(24, 58, '配置は模式図です。距離・移動可否は表しません。', 14);
        const positions = new Map(regions.map((region, index) => [region.id, { x: 110 + index % 4 * 185, y: 115 + Math.floor(index / 4) * 90 }]));
        const seen = new Set<string>();
        for (const region of regions) for (const id of list(region.connectedTo).slice(0, 100)) {
            const a = positions.get(region.id), b = positions.get(id);
            const key = JSON.stringify([region.id, id].sort());
            if (!a || !b || id === region.id || seen.has(key)) continue;
            seen.add(key);
            body += `<path d="M${a.x} ${a.y} L${b.x} ${b.y}" stroke="#64748b" stroke-width="2"/>`;
        }
        for (const region of regions) {
            const position = positions.get(region.id)!;
            const current = object(geography.currentRegion).id === region.id;
            body += `<rect x="${position.x - 80}" y="${position.y - 23}" width="160" height="46" rx="8" fill="${current ? '#dbeafe' : '#f1f5f9'}" stroke="${current ? '#2563eb' : '#64748b'}"/>`;
            body += label(position.x - 72, position.y + 5, String(region.name ?? region.id).slice(0, 9));
        }
        body += label(24, height - 15, regions.length ? `${regions.length}/${all.length}地域表示。完全な名前と接続はJSON参照。青枠は現在地域。` : '公開地域はありません。', 13);
    } else {
        const trade = list(view.availableActions).find(action => action?.actionId === 'commerce:trade');
        const all = list(object(trade?.estimate).commodities).filter(item => Number.isFinite(item?.stock) && item.stock >= 0
            && Number.isFinite(item?.unitPrice) && item.unitPrice >= 0);
        const items = all.slice(0, 20);
        height = Math.max(160, 110 + items.length * 45);
        body += label(24, 32, '現在市場の在庫', 22);
        body += label(24, 58, '棒は在庫数。単価は見積りです。取引前にpreviewを取得してください。', 14);
        const maximum = Math.max(1, ...items.map(item => item.stock));
        items.forEach((item, index) => {
            const y = 90 + index * 45;
            body += label(24, y + 16, String(item.commodityName ?? item.commodityId).slice(0, 10));
            body += `<rect x="200" y="${y}" width="${Math.round(item.stock / maximum * 320)}" height="22" fill="#2563eb"/>`;
            body += label(535, y + 16, `${item.stock}個 / 単価 ${item.unitPrice}`, 14);
        });
        body += label(24, height - 15, items.length ? `${items.length}/${all.length}商品表示。完全な一覧はJSON参照。` : '公開された市場データはありません。', 13);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img"><title>${kind === 'world-map' ? '公開地域の模式図' : '現在市場の在庫と見積単価'}</title><rect width="800" height="${height}" fill="white"/><g font-family="sans-serif" fill="#0f172a">${body}</g></svg>`;
}
