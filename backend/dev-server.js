// Локальная проверка: сайт + функция с хранилищем в памяти. Запуск: node dev-server.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { makeHandler } = require('./index');
const { memoryDb } = require('./db-memory');
process.env.SECRET = 'dev-secret'; process.env.SETUP_CODE = 'dev-setup';
const db = memoryDb(), handler = makeHandler(() => db);
const ROOT = path.join(__dirname, '..'), PORT = +process.env.PORT || 8770;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
http.createServer(async (req, res) => {
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
