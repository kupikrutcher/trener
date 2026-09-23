'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { handle, baseLogin } = require('./app');
const { memoryDb } = require('./db-memory');

const env = { SECRET: 'test-secret', SETUP_CODE: 'code123' };
const call = (db, req) => handle(req, db, env);
const rejects = (p, status) => assert.rejects(p, (e) => e.status === status);

async function world() {
  const db = memoryDb();
  const t = await call(db, { action: 'setup', code: 'code123', login: 'masha', full_name: 'Маша', password: 'teacherpass' });
  const c = await call(db, { action: 'students_create', token: t.token, names: ['Иванов Пётр', 'Иванова Полина'] });
  const [s1, s2] = await Promise.all(c.created.map((x) => call(db, { action: 'login', login: x.login, password: x.password })));
  return { db, T: t.token, S1: s1.token, S2: s2.token, created: c.created };
}
const work = { action: 'submit', test_name: 'Выборы',
  p1: [{ i: 0, n: '1', user: '25', ok: true }, { i: 1, n: '2', user: '12', ok: false }],
  p2: [{ i: 15, n: '22', pts: 4, text: 'ответ' }, { i: 16, n: '25', pts: 6, text: '' }] };

test('логины: транслит и уникальность', async () => {
  assert.equal(baseLogin('Иванов Пётр'), 'ivanov.p');
  const { created } = await world();
  assert.deepEqual(created.map((c) => c.login), ['ivanov.p', 'ivanova.p']);
  assert.match(created[0].password, /^[a-z2-9]{8}$/);
});

test('setup: только с кодом и только один раз', async () => {
  const db = memoryDb();
  await rejects(call(db, { action: 'setup', code: 'wrong', login: 'masha', password: 'teacherpass' }), 403);
  await rejects(call(db, { action: 'setup', code: 'code123', login: 'masha', password: 'short' }), 400);
  await call(db, { action: 'setup', code: 'code123', login: 'masha', password: 'teacherpass' });
  await rejects(call(db, { action: 'setup', code: 'code123', login: 'other', password: 'teacherpass' }), 409);
});

test('вход: неверный пароль, подделанный токен', async () => {
  const { db, S1 } = await world();
  await rejects(call(db, { action: 'login', login: 'ivanov.p', password: 'nope' }), 401);
  await rejects(call(db, { action: 'me', token: S1.slice(0, -2) + 'xx' }), 401);
  await rejects(call(db, { action: 'me' }), 401);
  const me = await call(db, { action: 'me', token: S1 });
  assert.equal(me.me.login, 'ivanov.p');
});

test('работа: ученик отправляет, баллы части 1 считает сервер', async () => {
  const { db, S1, S2, T } = await world();
  const { id } = await call(db, { ...work, token: S1, p1: [...work.p1, { i: 2, n: '3', user: '1', ok: true }] });
  const { sub } = await call(db, { action: 'sub_get', token: S1, id });
  assert.equal(sub.p1_score, 2); assert.equal(sub.p1_total, 3);
  assert.equal(sub.p2_max, 10); assert.equal(sub.p2_n, 2); assert.equal(sub.checked_at, null);
  await rejects(call(db, { action: 'sub_get', token: S2, id }), 404);          // чужая работа
  await rejects(call(db, { ...work, token: T }), 403);                          // учитель не сдаёт
  assert.equal((await call(db, { action: 'my_subs', token: S2 })).subs.length, 0);
});

test('проверка: только учитель, баллы в пределах максимума', async () => {
  const { db, S1, T } = await world();
  const { id } = await call(db, { ...work, token: S1 });
  await rejects(call(db, { action: 'grade', token: S1, id, grades: { 15: { score: 4 } } }), 403);
  assert.equal((await call(db, { action: 'todo_count', token: T })).count, 1);
  const r = await call(db, { action: 'grade', token: T, id, grades: { 15: { score: 99, comment: 'ок' }, 16: { score: 2 } }, comment: 'молодец' });
  assert.equal(r.p2_score, 6);                                                  // 4 (обрезано до максимума) + 2
  const { sub } = await call(db, { action: 'sub_get', token: S1, id });
  assert.equal(sub.grades[15].score, 4); assert.equal(sub.grades[15].comment, 'ок'); assert.equal(sub.comment, 'молодец');
  assert.equal((await call(db, { action: 'todo_count', token: T })).count, 0);
  assert.equal((await call(db, { action: 'subs_list', token: T, todo: true })).subs.length, 0);
  assert.equal((await call(db, { action: 'subs_list', token: T })).subs.length, 1);
});

test('ученики: список, новый пароль, удаление вместе с работами', async () => {
  const { db, S1, T, created } = await world();
  await call(db, { ...work, token: S1 });
  const list = (await call(db, { action: 'students_list', token: T })).students;
  assert.deepEqual(list.map((s) => [s.login, s.subs]), [['ivanov.p', 1], ['ivanova.p', 0]]);
  await rejects(call(db, { action: 'students_list', token: S1 }), 403);
  const { password } = await call(db, { action: 'student_reset', token: T, login: 'ivanov.p' });
  await rejects(call(db, { action: 'login', login: 'ivanov.p', password: created[0].password }), 401);
  await call(db, { action: 'login', login: 'ivanov.p', password });
  await call(db, { action: 'student_delete', token: T, login: 'ivanov.p' });
  await rejects(call(db, { action: 'me', token: S1 }), 401);                    // токен удалённого не работает
  assert.equal((await call(db, { action: 'subs_list', token: T })).subs.length, 0);
  await rejects(call(db, { action: 'student_delete', token: T, login: 'masha' }), 404); // учителя не удалить
});

test('аватар: только картинка, своя', async () => {
  const { db, S1 } = await world();
  await rejects(call(db, { action: 'set_avatar', token: S1, img: 'javascript:alert(1)' }), 400);
  await call(db, { action: 'set_avatar', token: S1, img: 'data:image/jpeg;base64,AAAA' });
  assert.equal((await call(db, { action: 'me', token: S1 })).me.avatar, 'data:image/jpeg;base64,AAAA');
  await call(db, { action: 'set_avatar', token: S1, img: null });
  assert.equal((await call(db, { action: 'me', token: S1 })).me.avatar, null);
});

test('смена пароля', async () => {
  const { db, T } = await world();
  await rejects(call(db, { action: 'change_password', token: T, old: 'bad', password: 'newpassword' }), 403);
  await call(db, { action: 'change_password', token: T, old: 'teacherpass', password: 'newpassword' });
  await call(db, { action: 'login', login: 'masha', password: 'newpassword' });
});

/* ---------- уроки ---------- */
const { videoEmbed } = require('./app');
function fakeStore() {
  const removed = [];
  return { removed, ok: true, uploadUrl: (k) => 'https://up/' + k, downloadUrl: (k, n) => 'https://down/' + k + '#' + n,
    remove: async (k) => { removed.push(k); } };
}
const callS = (db, store, req) => handle(req, db, env, store);

test('видео: YouTube, Rutube, VK', () => {
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://youtube.com/live/abcDEF12345'), 'https://www.youtube.com/embed/abcDEF12345');
  assert.equal(videoEmbed('https://rutube.ru/video/0123456789abcdef0123456789abcdef/'), 'https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef');
  assert.equal(videoEmbed('https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=KEY'), 'https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef?p=KEY');
  assert.equal(videoEmbed('https://rutube.ru/live/video/0123456789abcdef0123456789abcdef/'), 'https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef');
  assert.equal(videoEmbed('https://vkvideo.ru/video-12345_456239017'), 'https://vk.com/video_ext.php?oid=-12345&id=456239017&hd=2');
  assert.equal(videoEmbed('https://example.com/x'), null);
  assert.equal(videoEmbed('javascript:alert(1)'), null);
});

test('уроки: учитель создаёт, ученик видит только опубликованные', async () => {
  const { db, T, S1 } = await world(); const st = fakeStore();
  await rejects(callS(db, st, { action: 'lesson_save', token: S1, title: 'x' }), 403);
  await rejects(callS(db, st, { action: 'lesson_save', token: T, title: 'x', video: 'https://evil.com/v' }), 400);
  const up = await callS(db, st, { action: 'file_upload_url', token: T, name: 'конспект/1.pdf', size: 1000 });
  assert.match(up.key, /^lessons\/[\w.-]+\/конспект_1\.pdf$/);
  await rejects(callS(db, st, { action: 'file_upload_url', token: T, name: 'big.mp4', size: 200 * 1024 * 1024 }), 400);
  await rejects(callS(db, st, { action: 'file_upload_url', token: S1, name: 'a', size: 1 }), 403);
  const a = (await callS(db, st, { action: 'lesson_save', token: T, title: 'Выборы', video: 'https://youtu.be/dQw4w9WgXcQ',
    test_name: 'Выборы', files: [{ key: up.key, name: 'конспект.pdf', size: 1000 }], published: true })).lesson;
  await callS(db, st, { action: 'lesson_save', token: T, title: 'Черновик', published: false });
  assert.equal((await callS(db, st, { action: 'lessons_list', token: T })).lessons.length, 2);
  const mine = (await callS(db, st, { action: 'lessons_list', token: S1 })).lessons;
  assert.deepEqual(mine.map((l) => l.title), ['Выборы']);
  const g = (await callS(db, st, { action: 'lesson_get', token: S1, id: a.id })).lesson;
  assert.equal(g.embed, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(g.files[0].url, 'https://down/' + up.key + '#конспект.pdf');
  await rejects(callS(db, st, { action: 'lesson_save', token: T, title: 'x', files: [{ key: '../../etc/passwd', name: 'x' }] }), 400);
});

test('уроки: убранные и удалённые файлы стираются из хранилища', async () => {
  const { db, T, S1 } = await world(); const st = fakeStore();
  const f = (n) => ({ key: `lessons/k${n}/f${n}.pdf`, name: `f${n}.pdf`, size: 1 });
  const l = (await callS(db, st, { action: 'lesson_save', token: T, title: 'Урок', files: [f(1), f(2)] })).lesson;
  const draft = await callS(db, st, { action: 'lesson_get', token: S1, id: l.id }).catch((e) => e.status);
  assert.equal(draft, 404);                                                     // черновик ученику не виден
  await callS(db, st, { action: 'lesson_save', token: T, id: l.id, title: 'Урок', files: [f(2)], published: true });
  assert.deepEqual(st.removed, ['lessons/k1/f1.pdf']);
  await rejects(callS(db, st, { action: 'lesson_delete', token: S1, id: l.id }), 403);
  await callS(db, st, { action: 'lesson_delete', token: T, id: l.id });
  assert.deepEqual(st.removed, ['lessons/k1/f1.pdf', 'lessons/k2/f2.pdf']);
  assert.equal((await callS(db, st, { action: 'lessons_list', token: T })).lessons.length, 0);
});

test('дедлайн урока сохраняется, кривая дата — ошибка', async () => {
  const { db, T, S1 } = await world(); const st = fakeStore();
  const l = (await callS(db, st, { action: 'lesson_save', token: T, title: 'Урок', test_name: 'Выборы',
    deadline: '2026-10-01T20:59:00.000Z', published: true })).lesson;
  assert.equal(l.deadline, '2026-10-01T20:59:00.000Z');
  assert.equal((await callS(db, st, { action: 'lessons_list', token: S1 })).lessons[0].deadline, '2026-10-01T20:59:00.000Z');
  await rejects(callS(db, st, { action: 'lesson_save', token: T, title: 'x', deadline: 'завтра' }), 400);
  const noDl = (await callS(db, st, { action: 'lesson_save', token: T, title: 'Без дедлайна' })).lesson;
  assert.equal(noDl.deadline, '');
});

test('файлы к проверке: учитель прикрепляет, ученик видит, замена и удаление чистят хранилище', async () => {
  const { db, T, S1 } = await world(); const st = fakeStore();
  const { id } = await call(db, { ...work, token: S1 });
  const up = await callS(db, st, { action: 'file_upload_url', token: T, kind: 'grade', name: 'разбор.pdf', size: 10 });
  assert.match(up.key, /^grades\//);
  await rejects(callS(db, st, { action: 'grade', token: T, id, grades: {}, files: [{ key: 'lessons/x/y.pdf', name: 'y' }] }), 400);
  await callS(db, st, { action: 'grade', token: T, id, grades: {}, files: [{ key: up.key, name: 'разбор.pdf', size: 10 }] });
  const { sub } = await callS(db, st, { action: 'sub_get', token: S1, id });
  assert.equal(sub.files.length, 1); assert.equal(sub.files[0].url, 'https://down/' + up.key + '#разбор.pdf');
  await callS(db, st, { action: 'grade', token: T, id, grades: {}, files: [] });          // файл убрали при перепроверке
  assert.deepEqual(st.removed, [up.key]);
  const up2 = await callS(db, st, { action: 'file_upload_url', token: T, kind: 'grade', name: 'b.pdf', size: 1 });
  await callS(db, st, { action: 'grade', token: T, id, grades: {}, files: [{ key: up2.key, name: 'b.pdf', size: 1 }] });
  await callS(db, st, { action: 'student_delete', token: T, login: 'ivanov.p' });           // ученик удалён — файл тоже
  assert.deepEqual(st.removed, [up.key, up2.key]);
});
