// Хранилище в Yandex Database (serverless).
// Таблицы: users, avatars, subs (сводка работы — лёгкая, её читают списками), sub_body (ответы и оценки — по одной).
'use strict';
const { Driver, getCredentialsFromEnv, TypedValues: V, Types: T, TypedData } = require('ydb-sdk');

let driverPromise = null;
function driver() {
  if (!driverPromise) {
    driverPromise = (async () => {
      const d = new Driver({
        endpoint: process.env.YDB_ENDPOINT,
        database: process.env.YDB_DATABASE,
        authService: getCredentialsFromEnv(),
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
async function scheme(yql) {
  const d = await driver();
  return d.tableClient.withSession((s) => s.executeSchemeQuery(yql));
}

const optStr = (v) => (v == null ? V.optionalNull(T.UTF8) : V.optional(V.utf8(v)));
const parse = (s) => (s == null ? null : JSON.parse(s));

const META_COLS = 'id, student, test_name, created_at, p1_score, p1_total, p2_n, p2_max, p2_score, checked_at';

const SCHEMA = [
  `CREATE TABLE users (login Utf8, full_name Utf8, role Utf8, pass Utf8, created_at Utf8, PRIMARY KEY (login))`,
  `CREATE TABLE avatars (login Utf8, img Utf8, PRIMARY KEY (login))`,
  `CREATE TABLE subs (id Utf8, student Utf8, test_name Utf8, created_at Utf8, p1_score Int32, p1_total Int32,
     p2_n Int32, p2_max Int32, p2_score Int32, checked_at Utf8, PRIMARY KEY (id),
     INDEX by_student GLOBAL SYNC ON (student))`,
  `CREATE TABLE sub_body (id Utf8, p1 Utf8, p2 Utf8, grades Utf8, comment Utf8, PRIMARY KEY (id))`,
];

const db = {
  async createSchema() {
    for (const q of SCHEMA) {
      try { await scheme(q); }
      catch (e) { if (!/already exists|path exist/i.test(String(e.message))) throw e; }
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
    const [rows] = await query(`DECLARE $id AS Utf8; SELECT p1, p2, grades, comment FROM sub_body WHERE id = $id;`, { $id: V.utf8(id) });
    const r = rows[0]; if (!r) return null;
    return { p1: parse(r.p1) || [], p2: parse(r.p2) || [], grades: parse(r.grades), comment: r.comment ?? null };
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
      DECLARE $grades AS Utf8; DECLARE $comment AS Optional<Utf8>;
      UPDATE subs SET p2_score = $p2_score, checked_at = $checked_at WHERE id = $id;
      UPDATE sub_body SET grades = $grades, comment = $comment WHERE id = $id;`, {
      $id: V.utf8(id), $p2_score: V.int32(m.p2_score), $checked_at: V.utf8(m.checked_at),
      $grades: V.utf8(JSON.stringify(b.grades)), $comment: optStr(b.comment),
    });
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
