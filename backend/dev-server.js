// Локальная проверка: сайт + функция с хранилищем в памяти. Запуск: node dev-server.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { makeHandler } = require('./index');
const { memoryDb } = require('./db-memory');
process.env.SECRET = 'dev-secret'; process.env.SETUP_CODE = 'dev-setup';
const files = new Map();   // имитация Object Storage: файлы уроков в памяти
const store = { ok: true, remove: async (k) => files.delete(k),
  uploadUrl: (k) => `http://localhost:${+process.env.PORT || 8770}/_files/${encodeURIComponent(k)}`,
  downloadUrl: (k) => `http://localhost:${+process.env.PORT || 8770}/_files/${encodeURIComponent(k)}` };
const db = memoryDb(), handler = makeHandler(() => db, () => store);
const ROOT = path.join(__dirname, '..'), PORT = +process.env.PORT || 8770;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/_files/')) {
    const k = decodeURIComponent(req.url.slice(8).split('?')[0]);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, GET', 'Access-Control-Allow-Headers': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'PUT') { const ch = []; for await (const c of req) ch.push(c); files.set(k, Buffer.concat(ch)); res.writeHead(200, cors); return res.end(); }
    if (!files.has(k)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { ...cors, 'Content-Disposition': 'attachment' }); return res.end(files.get(k));
  }
  if (req.url.startsWith('/api')) {
    let body = ''; for await (const c of req) body += c;
    const r = await handler({ httpMethod: req.method, headers: req.headers, body, isBase64Encoded: false });
    res.writeHead(r.statusCode, r.headers); return res.end(r.body);
  }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  if (f.endsWith('index.html')) return res.end(fs.readFileSync(f, 'utf8')
    .replace('<script src="cabinet.js">', '<script>window.TRENER_API="/api"</script><script src="cabinet.js">'));
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
