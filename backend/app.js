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
/* ключ входа бессрочный: отключить его — удалить пользователя. В ключе дата создания аккаунта (c), чтобы ключ удалённого
   ученика не подошёл к новому аккаунту с тем же логином. Старые ключи без c (выданные на 90 дней) тоже принимаются — срок больше не проверяем */
function signToken(secret, u) {
  const body = b64u(JSON.stringify({ l: u.login, c: u.created_at }));
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
    return typeof p.l === 'string' ? p : null;
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

/* ссылки на видео: YouTube, Rutube, VK Видео, Kinescope → адрес для встраивания */
function videoEmbed(url) {
  if (!url) return null;
  let u; try { u = new URL(url.trim()); } catch { return null; }
  const h = u.hostname.replace(/^(www\.|m\.)/, '');
  let m;
  const yt = (id) => (/^[\w-]{6,20}$/.test(id || '') ? 'https://www.youtube.com/embed/' + id : null);
  if (h === 'youtu.be') return yt(u.pathname.slice(1).split('/')[0]);
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.searchParams.get('v')) return yt(u.searchParams.get('v'));
    if ((m = u.pathname.match(/^\/(embed|live|shorts)\/([\w-]+)/))) return yt(m[2]);
  }
  if (h === 'rutube.ru') {
    if ((m = u.pathname.match(/^\/(?:video|live\/video|play\/embed|shorts)\/(?:private\/)?([0-9a-f]{20,})/i))) {
      const p = u.searchParams.get('p');
      return 'https://rutube.ru/play/embed/' + m[1] + (p ? '?p=' + encodeURIComponent(p) : '');
    }
  }
  // Kinescope: kinescope.io/<id>, kinescope.io/embed/<id>, kinescope.io/watch/<id>
  if (h === 'kinescope.io' && (m = u.pathname.match(/^\/(?:embed\/|watch\/)?([A-Za-z0-9]{8,40})\/?$/)))
    return 'https://kinescope.io/embed/' + m[1];
  if (h === 'vk.com' || h === 'vkvideo.ru' || h === 'vk.ru') {
    if ((m = (u.pathname + u.search).match(/video(-?\d+)_(\d+)/))) return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`;
    if (u.pathname === '/video_ext.php') return u.toString();
  }
  return null;
}
/* список файлов из запроса: только ключи нашего хранилища с нужным префиксом */
const fileList = (arr, prefix, max = 30) => (Array.isArray(arr) ? arr : []).slice(0, max).map((f) => {
  const key = String(f.key || '');
  if (!new RegExp(`^${prefix}\\/[\\w.-]+\\/[^/]+$`).test(key)) fail(400, 'Неверный файл');
  return { key, name: safeName(f.name), size: int(f.size, 0, 1e9) };
});
const withUrls = (files, store) => (files || []).map((f) => ({ ...f, url: store.ok ? store.downloadUrl(f.key, f.name) : null }));
const dropRemoved = (store, before, after) => {
  if (!store.ok) return Promise.resolve();
  const keep = new Set((after || []).map((f) => f.key));
  return Promise.all((before || []).filter((f) => !keep.has(f.key)).map((f) => store.remove(f.key).catch(() => {})));
};
const isoOrEmpty = (v) => {
  if (!v) return '';
  const d = new Date(String(v));
  if (isNaN(d)) fail(400, 'Неверная дата дедлайна');
  return d.toISOString();
};
const safeName = (n) => String(n).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'file';
const pubLesson = (l) => ({ id: l.id, title: l.title, video: l.video, embed: videoEmbed(l.video), test_name: l.test_name, deadline: l.deadline || '', block: l.block || 0,
  published: !!l.published, created_at: l.created_at, updated_at: l.updated_at, files_n: (l.files || []).length });

/* ---------- действия ---------- */
async function handle(req, db, env, store = require('./s3').storage(env)) {
  const action = req.action;
  const secret = env.SECRET || fail(500, 'Сервер не настроен');

  // без входа
  if (action === 'login') {
    const login = str(req.login, 64, 'login').trim().toLowerCase();
    const pass = str(req.password, 200, 'password');
    const u = await db.getUser(login);
    if (!u || !checkPassword(pass, u.pass)) fail(401, 'Неверный логин или пароль');
    return { token: signToken(secret, u), me: { ...pub(u), avatar: await db.getAvatar(u.login) } };
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
    return { token: signToken(secret, u), me: { ...pub(u), avatar: null } };
  }

  // дальше — только с входом
  const t = readToken(secret, req.token);
  const me = t && await db.getUser(t.l);
  if (!me || (t.c && t.c !== me.created_at)) fail(401, 'Нужно войти');
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
      return { sub: { ...meta, ...body, files: withUrls(body.files, store), student_name } };
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
      const files = fileList(req.files, 'grades', 10);
      const checked_at = new Date().toISOString();
      await db.gradeSub(id, { p2_score: sum, checked_at }, { grades, comment, files });
      await dropRemoved(store, body.files, files);
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
      if (store.ok) {
        const bodies = await Promise.all((await db.listSubsOfStudent(u.login)).map((m) => db.getSubBody(m.id)));
        await dropRemoved(store, bodies.flatMap((b) => (b && b.files) || []), []);
      }
      await db.deleteStudent(u.login);
      return { ok: true };
    }

    /* ---------- уроки ---------- */
    case 'lessons_list': {
      let list = await db.listLessons();
      if (!teacher) list = list.filter((l) => l.published);
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { lessons: list.map(pubLesson) };
    }

    case 'lesson_get': {
      const l = await db.getLesson(str(req.id, 40, 'id'));
      if (!l || (!teacher && !l.published)) fail(404, 'Урок не найден');
      return { lesson: { ...pubLesson(l), files: withUrls(l.files, store) } };
    }

    case 'lesson_save': {
      onlyTeacher();
      const title = str(req.title, 200, 'title').trim();
      if (!title) fail(400, 'Нужно название урока');
      const video = req.video ? str(req.video, 500, 'video').trim() : '';
      if (video && !videoEmbed(video)) fail(400, 'Не понимаю ссылку на видео: нужна ссылка YouTube, Rutube, VK Видео или Kinescope');
      const test_name = req.test_name ? str(req.test_name, 300, 'test_name') : '';
      const files = fileList(req.files, 'lessons');
      const deadline = isoOrEmpty(req.deadline);
      // номер блока курса: 1–99, пусто/0 — без блока
      const block = req.block == null || req.block === '' ? 0 : Number(req.block);
      if (!Number.isInteger(block) || block < 0 || block > 99) fail(400, 'Номер блока — целое число от 1 до 99');
      const now = new Date().toISOString();
      const old = req.id ? await db.getLesson(str(req.id, 40, 'id')) : null;
      if (req.id && !old) fail(404, 'Урок не найден');
      const lesson = { id: old ? old.id : newId(), title, video, test_name, deadline, files, published: !!req.published, block,
        created_at: old ? old.created_at : now, updated_at: now };
      await db.putLesson(lesson);
      if (old) await dropRemoved(store, old.files, files);
      return { lesson: pubLesson(lesson) };
    }

    case 'lesson_delete': {
      onlyTeacher();
      const l = await db.getLesson(str(req.id, 40, 'id'));
      if (!l) fail(404, 'Урок не найден');
      await dropRemoved(store, l.files, []);
      await db.deleteLesson(l.id);
      return { ok: true };
    }

    case 'file_upload_url': {
      onlyTeacher();
      if (!store.ok) fail(503, 'Хранилище файлов не настроено');
      const size = int(req.size, 0, 2e9);
      if (size > 100 * 1024 * 1024) fail(400, 'Файл больше 100 МБ');
      const prefix = req.kind === 'grade' ? 'grades' : 'lessons';
      const key = `${prefix}/${newId()}/${safeName(str(req.name, 300, 'name'))}`;
      return { key, url: store.uploadUrl(key) };
    }

    default:
      fail(400, 'Неизвестное действие');
  }
}

module.exports = { handle, ApiError, hashPassword, checkPassword, signToken, readToken, baseLogin, videoEmbed };
