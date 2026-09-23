// Хранилище в памяти — для тестов. Повторяет интерфейс db-ydb.js.
'use strict';
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

function memoryDb() {
  const users = new Map(), avatars = new Map(), meta = new Map(), body = new Map();
  return {
    async getUser(login) { return clone(users.get(login)) || null; },
    async listUsers() { return [...users.values()].map(clone); },
    async putUser(u) { users.set(u.login, clone(u)); },
    async countTeachers() { return [...users.values()].filter((u) => u.role === 'teacher').length; },
    async getAvatar(login) { return avatars.get(login) || null; },
    async setAvatar(login, img) { img ? avatars.set(login, img) : avatars.delete(login); },
    async insertSub(m, b) { meta.set(m.id, clone(m)); body.set(b.id, clone(b)); },
    async getSubMeta(id) { return clone(meta.get(id)) || null; },
    async getSubBody(id) { const b = clone(body.get(id)); if (!b) return null; delete b.id; return b; },
    async listSubsOfStudent(login) { return [...meta.values()].filter((m) => m.student === login).map(clone); },
    async listAllSubs() { return [...meta.values()].map(clone); },
    async gradeSub(id, m, b) { Object.assign(meta.get(id), m); Object.assign(body.get(id), b); },
    async deleteStudent(login) {
      for (const [id, m] of meta) if (m.student === login) { meta.delete(id); body.delete(id); }
      users.delete(login); avatars.delete(login);
    },
  };
}
module.exports = { memoryDb };
