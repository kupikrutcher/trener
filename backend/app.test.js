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
