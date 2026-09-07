'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assets = new Map([
    ['/', ['voice-client.html', 'text/html; charset=utf-8']],
    ['/voice-client.js', ['voice-client.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || req.method !== 'GET' || !assets.has(req.url)) {
        res.writeHead(404); res.end(); return;
    }
    const [file, type] = assets.get(req.url);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(fs.readFileSync(path.resolve(__dirname, '../integrations', file)));
});
server.listen(0, '127.0.0.1', () => console.log(`Voice client: http://127.0.0.1:${server.address().port}/ (not connected; no microphone active)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
