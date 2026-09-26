// Хранилище в Yandex Database (serverless).
// Таблицы: users, avatars, subs (сводка работы — лёгкая, её читают списками), sub_body (ответы и оценки — по одной).
'use strict';
const { Driver, getCredentialsFromEnv, TokenAuthService, TypedValues: V, Types: T, TypedData } = require('ydb-sdk');

// Внутри Cloud Function токен сервисного аккаунта берём сами: из контекста вызова (index.js кладёт его
// в globalThis.__ycToken) или из сервиса метаданных. Штатный MetadataAuthService в ydb-sdk тянет
// тяжёлый @yandex-cloud/nodejs-sdk, которого в функции нет.
let mdToken = null, mdExp = 0;
async function functionToken() {
  if (globalThis.__ycToken) return globalThis.__ycToken;
  if (mdToken && Date.now() < mdExp) return mdToken;
  const r = await fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error('Нет токена сервисного аккаунта: ' + r.status);
  const j = await r.json();
  mdToken = j.access_token; mdExp = Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000;
  return mdToken;
}
const functionAuth = { getAuthMetadata: async () => new TokenAuthService(await functionToken()).getAuthMetadata() };

let driverPromise = null;
function driver() {
  if (!driverPromise) {
    driverPromise = (async () => {
      const d = new Driver({
        endpoint: process.env.YDB_ENDPOINT,
        database: process.env.YDB_DATABASE,
        authService: process.env.YDB_ACCESS_TOKEN_CREDENTIALS ? getCredentialsFromEnv() : functionAuth,
      });
      if (!(await d.ready(10000))) { driverPromise = null; throw new Error('База недоступна'); }
      return d;
    })();
  }
  return driverPromise;
}

async function query(yql, params = {}) {
  const d = await driver();
  return d.tableClient.withSession(async (s) => {
    const r = await s.executeQuery(yql, params);
    return r.resultSets.map((rs) => TypedData.createNativeObjects(rs).map((o) => ({ ...o })));
  });
}
// создание таблиц — через Query-сервис (в табличных сессиях этой версии SDK DDL нет)
async function scheme(yql) {
  const d = await driver();
  return d.queryClient.do({ fn: async (s) => { const r = await s.execute({ text: yql }); await r.opFinished; } });
}

const optStr = (v) => (v == null ? V.optionalNull(T.UTF8) : V.optional(V.utf8(v)));
const parse = (s) => (s == null ? null : JSON.parse(s));

const META_COLS = 'id, student, test_name, created_at, p1_score, p1_total, p2_n, p2_max, p2_score, checked_at';

// Схема: таблицы и их колонки. При развёртывании создаются недостающие таблицы и колонки,
// существующие данные не трогаются.
const TABLES = {
  users: { cols: { login: 'Utf8', full_name: 'Utf8', role: 'Utf8', pass: 'Utf8', created_at: 'Utf8' }, pk: 'login' },
  avatars: { cols: { login: 'Utf8', img: 'Utf8' }, pk: 'login' },
  subs: { cols: { id: 'Utf8', student: 'Utf8', test_name: 'Utf8', created_at: 'Utf8', p1_score: 'Int32', p1_total: 'Int32',
    p2_n: 'Int32', p2_max: 'Int32', p2_score: 'Int32', checked_at: 'Utf8' }, pk: 'id', extra: 'INDEX by_student GLOBAL SYNC ON (student)' },
  sub_body: { cols: { id: 'Utf8', p1: 'Utf8', p2: 'Utf8', grades: 'Utf8', comment: 'Utf8', files: 'Utf8' }, pk: 'id' },
  lessons: { cols: { id: 'Utf8', title: 'Utf8', video: 'Utf8', test_name: 'Utf8', deadline: 'Utf8', files: 'Utf8', published: 'Bool',
    created_at: 'Utf8', updated_at: 'Utf8', block: 'Int32', descr: 'Utf8' }, pk: 'id' },
  hws: { cols: { id: 'Utf8', name: 'Utf8', folder: 'Utf8', questions: 'Utf8', created_at: 'Utf8' }, pk: 'id' },
};
// колонки существующей таблицы или null, если таблицы нет
async function tableColumns(name) {
  const d = await driver();
  try {
    return await d.tableClient.withSession(async (s) => (await s.describeTable(name)).columns.map((c) => c.name));
  } catch (e) {
    const text = `${e && e.constructor && e.constructor.name} ${e && e.name} ${e && e.message}`;
    if (/SchemeError|not found|not exist|isn't exist|does not exist/i.test(text)) return null;
    throw e;
  }
}
const LESSON_COLS = 'id, title, video, test_name, deadline, files, published, created_at, updated_at, block, descr';
const lessonRow = (r) => (r ? { ...r, deadline: r.deadline || '', files: parse(r.files) || [], published: !!r.published, block: r.block || 0, descr: r.descr || '' } : null);

const db = {
  async createSchema() {
    for (const [name, t] of Object.entries(TABLES)) {
      const have = await tableColumns(name);
      if (!have) {
        const cols = Object.entries(t.cols).map(([c, type]) => `${c} ${type}`).join(', ');
        await scheme(`CREATE TABLE ${name} (${cols}, PRIMARY KEY (${t.pk})${t.extra ? ', ' + t.extra : ''})`);
        console.log(`   создана таблица ${name}`);
        continue;
      }
      for (const [c, type] of Object.entries(t.cols)) {
        if (have.includes(c)) continue;
        await scheme(`ALTER TABLE ${name} ADD COLUMN ${c} ${type}`);
        console.log(`   ${name}: добавлена колонка ${c}`);
      }
    }
  },

  async getUser(login) {
    const [rows] = await query(`DECLARE $login AS Utf8;
      SELECT login, full_name, role, pass, created_at FROM users WHERE login = $login;`, { $login: V.utf8(login) });
    return rows[0] || null;
  },
  async listUsers() {
    const [rows] = await query(`SELECT login, full_name, role, created_at FROM users LIMIT 1000;`);
    return rows;
  },
  async putUser(u) {
    await query(`DECLARE $login AS Utf8; DECLARE $full_name AS Utf8; DECLARE $role AS Utf8; DECLARE $pass AS Utf8; DECLARE $created_at AS Utf8;
      UPSERT INTO users (login, full_name, role, pass, created_at) VALUES ($login, $full_name, $role, $pass, $created_at);`, {
      $login: V.utf8(u.login), $full_name: V.utf8(u.full_name), $role: V.utf8(u.role),
      $pass: V.utf8(u.pass), $created_at: V.utf8(u.created_at),
    });
  },
  async countTeachers() {
    const [rows] = await query(`SELECT CAST(COUNT(*) AS Int32) AS c FROM users WHERE role = "teacher";`);
    return rows[0].c;
  },

  async getAvatar(login) {
    const [rows] = await query(`DECLARE $login AS Utf8; SELECT img FROM avatars WHERE login = $login;`, { $login: V.utf8(login) });
    return rows[0] ? rows[0].img : null;
  },
  async setAvatar(login, img) {
    if (img) await query(`DECLARE $login AS Utf8; DECLARE $img AS Utf8; UPSERT INTO avatars (login, img) VALUES ($login, $img);`,
      { $login: V.utf8(login), $img: V.utf8(img) });
    else await query(`DECLARE $login AS Utf8; DELETE FROM avatars WHERE login = $login;`, { $login: V.utf8(login) });
  },

  async insertSub(m, b) {
    await query(`DECLARE $id AS Utf8; DECLARE $student AS Utf8; DECLARE $test_name AS Utf8; DECLARE $created_at AS Utf8;
      DECLARE $p1_score AS Int32; DECLARE $p1_total AS Int32; DECLARE $p2_n AS Int32; DECLARE $p2_max AS Int32;
      DECLARE $p1 AS Utf8; DECLARE $p2 AS Utf8;
      UPSERT INTO subs (id, student, test_name, created_at, p1_score, p1_total, p2_n, p2_max)
        VALUES ($id, $student, $test_name, $created_at, $p1_score, $p1_total, $p2_n, $p2_max);
      UPSERT INTO sub_body (id, p1, p2) VALUES ($id, $p1, $p2);`, {
      $id: V.utf8(m.id), $student: V.utf8(m.student), $test_name: V.utf8(m.test_name), $created_at: V.utf8(m.created_at),
      $p1_score: V.int32(m.p1_score), $p1_total: V.int32(m.p1_total), $p2_n: V.int32(m.p2_n), $p2_max: V.int32(m.p2_max),
      $p1: V.utf8(JSON.stringify(b.p1)), $p2: V.utf8(JSON.stringify(b.p2)),
    });
  },
  async getSubMeta(id) {
    const [rows] = await query(`DECLARE $id AS Utf8; SELECT ${META_COLS} FROM subs WHERE id = $id;`, { $id: V.utf8(id) });
    return rows[0] || null;
  },
  async getSubBody(id) {
    const [rows] = await query(`DECLARE $id AS Utf8; SELECT p1, p2, grades, comment, files FROM sub_body WHERE id = $id;`, { $id: V.utf8(id) });
    const r = rows[0]; if (!r) return null;
    return { p1: parse(r.p1) || [], p2: parse(r.p2) || [], grades: parse(r.grades), comment: r.comment ?? null, files: parse(r.files) || [] };
  },
  async listSubsOfStudent(login) {
    const [rows] = await query(`DECLARE $s AS Utf8; SELECT ${META_COLS} FROM subs VIEW by_student WHERE student = $s LIMIT 1000;`,
      { $s: V.utf8(login) });
    return rows;
  },
  // все работы — постранично, результат одного запроса ограничен 1000 строк
  async listAllSubs() {
    const out = []; let last = '';
    for (;;) {
      const [rows] = await query(`DECLARE $last AS Utf8;
        SELECT ${META_COLS} FROM subs WHERE id > $last ORDER BY id LIMIT 1000;`, { $last: V.utf8(last) });
      out.push(...rows);
      if (rows.length < 1000) return out;
      last = rows[rows.length - 1].id;
    }
  },
  async gradeSub(id, m, b) {
    await query(`DECLARE $id AS Utf8; DECLARE $p2_score AS Int32; DECLARE $checked_at AS Utf8;
      DECLARE $grades AS Utf8; DECLARE $comment AS Optional<Utf8>; DECLARE $files AS Utf8;
      UPDATE subs SET p2_score = $p2_score, checked_at = $checked_at WHERE id = $id;
      UPDATE sub_body SET grades = $grades, comment = $comment, files = $files WHERE id = $id;`, {
      $id: V.utf8(id), $p2_score: V.int32(m.p2_score), $checked_at: V.utf8(m.checked_at),
      $grades: V.utf8(JSON.stringify(b.grades)), $comment: optStr(b.comment), $files: V.utf8(JSON.stringify(b.files || [])),
    });
  },
  async listLessons() {
    const [rows] = await query(`SELECT ${LESSON_COLS} FROM lessons LIMIT 1000;`);
    return rows.map(lessonRow);
  },
  async getLesson(id) {
    const [rows] = await query(`DECLARE $id AS Utf8; SELECT ${LESSON_COLS} FROM lessons WHERE id = $id;`, { $id: V.utf8(id) });
    return lessonRow(rows[0]);
  },
  async putLesson(l) {
    await query(`DECLARE $id AS Utf8; DECLARE $title AS Utf8; DECLARE $video AS Utf8; DECLARE $test_name AS Utf8; DECLARE $deadline AS Utf8;
      DECLARE $files AS Utf8; DECLARE $published AS Bool; DECLARE $created_at AS Utf8; DECLARE $updated_at AS Utf8; DECLARE $block AS Int32; DECLARE $descr AS Utf8;
      UPSERT INTO lessons (${LESSON_COLS}) VALUES ($id, $title, $video, $test_name, $deadline, $files, $published, $created_at, $updated_at, $block, $descr);`, {
      $id: V.utf8(l.id), $title: V.utf8(l.title), $video: V.utf8(l.video || ''), $test_name: V.utf8(l.test_name || ''),
      $deadline: V.utf8(l.deadline || ''),
      $files: V.utf8(JSON.stringify(l.files || [])), $published: V.bool(!!l.published),
      $created_at: V.utf8(l.created_at), $updated_at: V.utf8(l.updated_at), $block: V.int32(l.block || 0), $descr: V.utf8(l.descr || ''),
    });
  },
  async deleteLesson(id) {
    await query(`DECLARE $id AS Utf8; DELETE FROM lessons WHERE id = $id;`, { $id: V.utf8(id) });
  },
  async listHws() {
    const [rows] = await query(`SELECT id, name, folder, questions, created_at FROM hws LIMIT 1000;`);
    return rows.map((r) => ({ ...r, questions: parse(r.questions) || [] }));
  },
  async putHw(t) {
    await query(`DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $folder AS Utf8; DECLARE $questions AS Utf8; DECLARE $created_at AS Utf8;
      UPSERT INTO hws (id, name, folder, questions, created_at) VALUES ($id, $name, $folder, $questions, $created_at);`, {
      $id: V.utf8(t.id), $name: V.utf8(t.name), $folder: V.utf8(t.folder), $questions: V.utf8(JSON.stringify(t.questions)),
      $created_at: V.utf8(t.created_at),
    });
  },
  async deleteHw(id) {
    await query(`DECLARE $id AS Utf8; DELETE FROM hws WHERE id = $id;`, { $id: V.utf8(id) });
  },
  async deleteStudent(login) {
    const ids = (await this.listSubsOfStudent(login)).map((s) => s.id);
    await query(`DECLARE $ids AS List<Utf8>; DECLARE $login AS Utf8;
      DELETE FROM subs WHERE id IN $ids;
      DELETE FROM sub_body WHERE id IN $ids;
      DELETE FROM avatars WHERE login = $login;
      DELETE FROM users WHERE login = $login;`, {
      $ids: V.list(T.UTF8, ids), $login: V.utf8(login),
    });
  },
};

module.exports = { ydbDb: db };
