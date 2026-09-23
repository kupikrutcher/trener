// Логика API тренажёра: вход, работы учеников, проверка, ученики.
// Не знает, где лежат данные, — хранилище передаётся снаружи (YDB в облаке, память в тестах).
'use strict';
const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new ApiError(status, msg); };

/* ---------- пароли и токены ---------- */
function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(pass, salt, 32, { N: 16384 }).toString('base64');
  return `scrypt$${salt}$${hash}`;
}
function checkPassword(pass, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(pass, salt, 32, { N: 16384 });
  const want = Buffer.from(hash, 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const b64u = (s) => Buffer.from(s).toString('base64url');
function signToken(secret, login, days = 90) {
  const body = b64u(JSON.stringify({ l: login, e: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}
function readToken(secret, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.e > Date.now() ? p.l : null;
  } catch { return null; }
}

/* ---------- логины учеников ---------- */
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
  р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const translit = (s) => s.toLowerCase().split('').map((c) => TR[c] ?? c).join('').replace(/[^a-z0-9]/g, '');
function baseLogin(name) {
  const parts = name.trim().split(/\s+/).map(translit).filter(Boolean);
  if (!parts.length) return 'student';
  return (parts[0] + (parts[1] ? '.' + parts[1][0] : '')).slice(0, 24);
}
function newPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), (x) => abc[x % abc.length]).join('');
}
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/* ---------- проверки входных данных ---------- */
const str = (v, max, name) => {
  if (typeof v !== 'string') fail(400, `Нет поля ${name}`);
  if (v.length > max) fail(400, `Слишком длинное поле ${name}`);
  return v;
};
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const pub = (u) => ({ login: u.login, full_name: u.full_name, role: u.role });
const newId = () => Date.now().toString(36).padStart(9, '0') + crypto.randomBytes(4).toString('hex');

/* ---------- действия ---------- */
async function handle(req, db, env) {
  const action = req.action;
  const secret = env.SECRET || fail(500, 'Сервер не настроен');

  // без входа
  if (action === 'login') {
    const login = str(req.login, 64, 'login').trim().toLowerCase();
    const pass = str(req.password, 200, 'password');
    const u = await db.getUser(login);
    if (!u || !checkPassword(pass, u.pass)) fail(401, 'Неверный логин или пароль');
    return { token: signToken(secret, u.login), me: { ...pub(u), avatar: await db.getAvatar(u.login) } };
  }
  if (action === 'setup') {
    // первый вход учителя: только с кодом из настроек функции и пока учителя нет
    if (!env.SETUP_CODE || req.code !== env.SETUP_CODE) fail(403, 'Неверный код');
    if (await db.countTeachers() > 0) fail(409, 'Учитель уже создан');
    const login = str(req.login, 32, 'login').trim().toLowerCase();
    if (!LOGIN_RE.test(login)) fail(400, 'Логин: латинские буквы, цифры, точка');
    const pass = str(req.password, 200, 'password');
    if (pass.length < 8) fail(400, 'Пароль — минимум 8 символов');
    const full_name = str(req.full_name || 'Учитель', 100, 'full_name').trim() || 'Учитель';
    const u = { login, full_name, role: 'teacher', pass: hashPassword(pass), created_at: new Date().toISOString() };
    await db.putUser(u);
    return { token: signToken(secret, login), me: { ...pub(u), avatar: null } };
  }

  // дальше — только с входом
  const login = readToken(secret, req.token);
  const me = login && await db.getUser(login);
  if (!me) fail(401, 'Нужно войти');
  const teacher = me.role === 'teacher';
  const onlyTeacher = () => { if (!teacher) fail(403, 'Только для учителя'); };

  switch (action) {
    case 'me':
      return { me: { ...pub(me), avatar: await db.getAvatar(me.login) } };

    case 'set_avatar': {
      const img = req.img == null ? null : str(req.img, 150000, 'img');
      if (img && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) fail(400, 'Это не картинка');
      await db.setAvatar(me.login, img);
      return { ok: true };
    }

    case 'change_password': {
      if (!checkPassword(str(req.old, 200, 'old'), me.pass)) fail(403, 'Старый пароль неверный');
      const pass = str(req.password, 200, 'password');
      if (pass.length < 8) fail(400, 'Пароль — минимум 8 символов');
      await db.putUser({ ...me, pass: hashPassword(pass) });
      return { ok: true };
    }

    case 'submit': {
      if (teacher) fail(403, 'Учитель не отправляет работы');
      const test_name = str(req.test_name, 300, 'test_name');
      const p1 = Array.isArray(req.p1) ? req.p1.slice(0, 200).map((x) => ({
        i: int(x.i, 0, 1000), n: String(x.n ?? '').slice(0, 10), user: String(x.user ?? '').slice(0, 50), ok: !!x.ok,
      })) : [];
      const p2 = Array.isArray(req.p2) ? req.p2.slice(0, 50).map((x) => ({
        i: int(x.i, 0, 1000), n: String(x.n ?? '').slice(0, 10), pts: int(x.pts, 0, 20), text: String(x.text ?? '').slice(0, 20000),
      })) : [];
      const meta = {
        id: newId(), student: me.login, test_name, created_at: new Date().toISOString(),
        p1_score: p1.filter((x) => x.ok).length, p1_total: p1.length,
        p2_n: p2.length, p2_max: p2.reduce((s, x) => s + x.pts, 0), p2_score: null, checked_at: null,
      };
      await db.insertSub(meta, { id: meta.id, p1, p2, grades: null, comment: null });
      return { id: meta.id };
    }

    case 'my_subs':
      return { subs: await db.listSubsOfStudent(me.login) };

    case 'sub_get': {
      const id = str(req.id, 40, 'id');
      const meta = await db.getSubMeta(id);
      if (!meta || (!teacher && meta.student !== me.login)) fail(404, 'Работа не найдена');
      const body = await db.getSubBody(id);
      let student_name = null;
      if (teacher) { const s = await db.getUser(meta.student); student_name = s ? s.full_name : null; }
      return { sub: { ...meta, ...body, student_name } };
    }

    case 'grade': {
      onlyTeacher();
      const id = str(req.id, 40, 'id');
      const meta = await db.getSubMeta(id);
      if (!meta) fail(404, 'Работа не найдена');
      const body = await db.getSubBody(id);
      const grades = {}; let sum = 0;
      for (const x of body.p2) {
        const g = (req.grades || {})[x.i] || {};
        const score = int(g.score, 0, x.pts);
        grades[x.i] = { score, comment: String(g.comment ?? '').slice(0, 5000) };
        sum += score;
      }
      const comment = req.comment ? String(req.comment).slice(0, 5000) : null;
      const checked_at = new Date().toISOString();
      await db.gradeSub(id, { p2_score: sum, checked_at }, { grades, comment });
      return { p2_score: sum, checked_at };
    }

    case 'subs_list': {
      onlyTeacher();
      const student = req.student ? str(req.student, 64, 'student') : null;
      let subs = student ? await db.listSubsOfStudent(student) : await db.listAllSubs();
      if (req.todo) subs = subs.filter((s) => s.p2_n > 0 && !s.checked_at);
      subs.sort((a, b) => (req.todo ? 1 : -1) * a.created_at.localeCompare(b.created_at));
      return { subs: subs.slice(0, 1000) };
    }

    case 'todo_count': {
      onlyTeacher();
      const subs = await db.listAllSubs();
      return { count: subs.filter((s) => s.p2_n > 0 && !s.checked_at).length };
    }

    case 'students_list': {
      onlyTeacher();
      const [users, subs] = await Promise.all([db.listUsers(), db.listAllSubs()]);
      const cnt = {}; subs.forEach((s) => { cnt[s.student] = (cnt[s.student] || 0) + 1; });
      return {
        students: users.filter((u) => u.role === 'student')
          .map((u) => ({ ...pub(u), subs: cnt[u.login] || 0 }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
      };
    }

    case 'students_create': {
      onlyTeacher();
      const names = (Array.isArray(req.names) ? req.names : []).map((s) => String(s).trim().slice(0, 100)).filter(Boolean).slice(0, 200);
      if (!names.length) fail(400, 'Список пуст');
      const taken = new Set((await db.listUsers()).map((u) => u.login));
      const created = [];
      for (const full_name of names) {
        const base = baseLogin(full_name);
        let login = base, k = 2;
        while (taken.has(login)) login = base + k++;
        taken.add(login);
        const password = newPassword();
        await db.putUser({ login, full_name, role: 'student', pass: hashPassword(password), created_at: new Date().toISOString() });
        created.push({ login, full_name, password });
      }
      return { created, failed: [] };
    }

    case 'student_reset': {
      onlyTeacher();
      const u = await db.getUser(str(req.login, 64, 'login'));
      if (!u || u.role !== 'student') fail(404, 'Ученик не найден');
      const password = newPassword();
      await db.putUser({ ...u, pass: hashPassword(password) });
      return { password };
    }

    case 'student_delete': {
      onlyTeacher();
      const u = await db.getUser(str(req.login, 64, 'login'));
      if (!u || u.role !== 'student') fail(404, 'Ученик не найден');
      await db.deleteStudent(u.login);
      return { ok: true };
    }

    default:
      fail(400, 'Неизвестное действие');
  }
}

module.exports = { handle, ApiError, hashPassword, checkPassword, signToken, readToken, baseLogin };
