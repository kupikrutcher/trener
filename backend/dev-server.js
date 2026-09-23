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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp' };
/* --demo: примерные данные, чтобы посмотреть сайт целиком (вход: demo / demo1234, учитель: masha / teacherpass) */
async function seedDemo() {
  const { hashPassword } = require('./app');
  const now = Date.now(), D = 864e5, iso = (t) => new Date(t).toISOString();
  await db.putUser({ login: 'masha', full_name: 'Маша Вайб', role: 'teacher', pass: hashPassword('teacherpass'), created_at: iso(now) });
  await db.putUser({ login: 'demo', full_name: 'Лиза Демо', role: 'student', pass: hashPassword('demo1234'), created_at: iso(now) });
  await db.putUser({ login: 'ivanov.p', full_name: 'Иванов Пётр', role: 'student', pass: hashPassword('demo1234'), created_at: iso(now) });
  const lessons = [
    ['Выборы и избирательные системы', 'Выборы', 2], ['Налоги', 'Налоги', -1], ['Инфляция', 'Инфляция', -4],
    ['Семейное право', 'Семейное право', 6], ['Политические партии', 'Политические партии, Политическая идеология', 12],
    ['Рынок труда', 'Рынок труда, безработица', -10],
  ];
  for (const [i, [title, test_name, days]] of lessons.entries())
    await db.putLesson({ id: 'demo' + i, title, video: '', test_name, deadline: iso(now + days * D), files: [], published: true,
      created_at: iso(now - (10 - i) * D), updated_at: iso(now) });
  // проверенные работы ученицы — для графика прогресса и «Проверки»
  const past = [['Инфляция', 7, 14, 3, 8], ['Рынок труда, безработица', 9, 15, 5, 8], ['Налоги', 11, 16, 6, 8], ['Выборы', 12, 15, null, 8]];
  for (const [i, [test_name, s1, t1, s2, m2]] of past.entries()) {
    const id = 'demosub' + i;
    await db.insertSub({ id, student: 'demo', test_name, created_at: iso(now - (8 - i * 2) * D), p1_score: s1, p1_total: t1,
      p2_n: 2, p2_max: m2, p2_score: null, checked_at: null },
    { id, p1: [], p2: [{ i: 0, n: '24', pts: 4, text: 'План по теме…' }, { i: 1, n: '25', pts: 4, text: 'Обоснование…' }], grades: null, comment: null });
    if (s2 != null) await db.gradeSub(id, { p2_score: s2, checked_at: iso(now - (7 - i * 2) * D) },
      { grades: { 0: { score: Math.ceil(s2 / 2), comment: '' }, 1: { score: Math.floor(s2 / 2), comment: '' } }, comment: 'Хорошо, план подробнее', files: [] });
  }
  console.log('демо: ученик demo / demo1234, учитель masha / teacherpass');
}
if (process.argv.includes('--demo')) seedDemo();

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
