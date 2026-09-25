// Только для локального демо (dev-server.js --demo подключает этот файл, на сайт он не публикуется):
// панель внизу — открыть любой экран без ручного входа. Сама входит под нужной ролью (ученик demo / учитель masha).
'use strict';
(function () {
  const USERS = { student: ['demo', 'demo1234'], teacher: ['masha', 'teacherpass'] };
  async function as(role) {
    if (!role) { if (me) doLogout(); return; }
    if (me && me.role === role) return;
    const [login, password] = USERS[role];
    const r = await api('login', { login, password });
    setToken(r.token); me = r.me;
    await loadSubmitted(); paintAcct();
  }
  const firstLesson = async () => (await api('lessons_list')).lessons[0].id;
  const openHW = async () => { await loadTests(); openTest(tests.find((t) => t.name === 'Налоги').id); };
  const SCREENS = [
    ['Главная', null, () => home()],
    ['Вход', null, () => cabLogin()],
    ['Уроки', 'student', () => navGo('lessons')],
    ['Урок', 'student', async () => lessonView(await firstLesson())],
    ['Задание', 'student', openHW],
    ['Результат', 'student', async () => {
      await openHW();
      results = bank.filter((q) => !isP2(q)).map((q, i) => ({ q, ok: i % 4 !== 1, p2: false }));
      score = results.filter((r) => r.ok).length; finish();
    }],
    ['Профиль', 'student', () => openCabinet()],
    ['Расписание', 'student', () => navGo('schedule')],
    ['Банк', 'student', () => navGo('bank')],
    ['Файлы', 'student', () => navGo('files')],
    ['Учитель', 'teacher', () => cabTeacher('check')],
  ];
  const css = document.createElement('style');
  css.textContent = `.demonav{position:fixed;z-index:60;left:50%;bottom:14px;translate:-50% 0;display:flex;gap:2px;padding:5px;max-width:calc(100vw - 20px);
    overflow-x:auto;scrollbar-width:none;background:rgba(29,29,31,.82);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);
    border-radius:14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.5);font:500 13px/1 -apple-system,system-ui,sans-serif}
  .demonav::-webkit-scrollbar{display:none}
  .demonav button{flex:none;border:0;background:none;color:rgba(255,255,255,.78);font:inherit;padding:9px 11px;border-radius:9px;cursor:pointer}
  .demonav button:hover{background:rgba(255,255,255,.1);color:#fff}
  .demonav button[aria-pressed="true"]{background:#fff;color:#1d1d1f}
  .demonav span{align-self:center;color:rgba(255,255,255,.45);padding:0 6px 0 8px}`;
  document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'demonav'; bar.setAttribute('aria-label', 'Экраны демо');
    bar.innerHTML = '<span>Демо</span>' + SCREENS.map(([t], i) => `<button type="button" data-i="${i}">${t}</button>`).join('');
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const [, role, open] = SCREENS[b.dataset.i];
      bar.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      try { await as(role); await open(); scrollTo(0, 0); } catch (err) { toast('Демо: ' + err.message); }
    });
    document.body.appendChild(bar);
  });
})();
