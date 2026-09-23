/* ===== Кабинеты: вход, отправка работ, проверка части 2 (Supabase) ===== */
/* Адрес проекта и публичный ключ (anon) из Supabase → Project Settings → API.
   Публичный ключ можно держать на сайте: доступ к данным ограничен правилами в базе. */
const SB_URL = 'https://rhriliazguafqlaxodwc.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJocmlsaWF6Z3VhZnFsYXhvZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk0OTUsImV4cCI6MjEwNTcyNTQ5NX0.XzxsmVVfXA_VMCRAcTJm9WVNELKrJaOCAZADm2Cgqwo';
const LOGIN_DOMAIN = 'students.example.com';
const FN_STUDENTS = 'swift-handler';   // адрес функции «students» в Supabase

const CAB = !!(SB_URL && SB_KEY && window.supabase);
const sb = CAB ? window.supabase.createClient(SB_URL, SB_KEY) : null;
let me = null;              // {id, login, full_name, role}
let sentFor = null;         // results текущего прохождения, которое уже отправлено
let afterLogin = null;

function cabEl(){ return document.getElementById('acct'); }
function firstName(n){ const p=(n||'').trim().split(/\s+/); return p[1]||p[0]||''; }
function fmtDate(s){ const d=new Date(s);
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
function findTest(name){ return tests.find(t=>t.builtin&&t.name===name)||tests.find(t=>t.name===name); }
function cabShow(html){
  $('#bars').style.display='none'; $('#foot').textContent='';
  app.className='panel fade'; app.innerHTML=html; window.scrollTo({top:0});
}
function busy(btn,on,text){ if(!btn)return; btn.disabled=on; if(text) btn.textContent=text; btn.style.opacity=on?.6:1; }

/* ---------- сессия ---------- */
async function loadMe(){
  me=null;
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    const { data } = await sb.from('profiles').select('id,login,full_name,role').eq('id',session.user.id).single();
    me=data||null;
  }
  paintAcct();
}
function paintAcct(){
  const b=cabEl(); if(!b) return;
  if(!CAB){ b.style.display='none'; return; }
  b.style.display='';
  b.textContent = me ? (me.role==='teacher'?'Проверка':'Кабинет') : 'Войти';
  b.onclick = ()=> me ? openCabinet() : cabLogin();
}
function openCabinet(){ if(!me) return cabLogin(); me.role==='teacher' ? cabTeacher('todo') : cabStudent(); }

/* ---------- вход ---------- */
function cabLogin(then){
  afterLogin = then || null;
  cabShow(`
    <div class="cab">
      <h2 class="cab-h">Вход</h2>
      <p class="cab-sub">Логин и пароль выдаёт учитель.</p>
      <label class="lab" for="lg">Логин</label>
      <input id="lg" class="tin" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="например, ivanov.p">
      <label class="lab" for="pw" style="margin-top:14px">Пароль</label>
      <input id="pw" class="tin" type="password" autocomplete="current-password">
      <div class="cab-err" id="lerr"></div>
      <button class="btn" id="lbtn" onclick="doLogin()">Войти</button>
      <button class="linkfin" onclick="${afterLogin?'afterLoginBack()':'home()'}">Назад</button>
    </div>`);
  const lg=$('#lg'), pw=$('#pw'); lg.focus();
  [lg,pw].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); doLogin(); } }));
}
function afterLoginBack(){ const f=afterLogin; afterLogin=null; f?f():home(); }
async function doLogin(){
  const login=$('#lg').value.trim().toLowerCase(), pass=$('#pw').value, btn=$('#lbtn');
  if(!login||!pass){ $('#lerr').textContent='Введи логин и пароль'; return; }
  busy(btn,true,'Входим…');
  const email = login.includes('@') ? login : login+'@'+LOGIN_DOMAIN;
  const { error } = await sb.auth.signInWithPassword({ email, password:pass });
  if(error){ busy(btn,false,'Войти'); $('#lerr').textContent = /invalid/i.test(error.message)?'Неверный логин или пароль':'Не удалось войти: '+error.message; return; }
  await loadMe();
  if(!me){ await sb.auth.signOut(); busy(btn,false,'Войти'); $('#lerr').textContent='Аккаунт не найден. Обратись к учителю.'; return; }
  toast('Привет, '+firstName(me.full_name)+'!');
  const f=afterLogin; afterLogin=null;
  f ? f() : openCabinet();
}
async function doLogout(){ await sb.auth.signOut(); me=null; paintAcct(); home(); }

/* ---------- отправка работы (на экране результата) ---------- */
function renderSendBox(){
  const box=document.getElementById('sendbox'); if(!box) return;
  const t=findTest(curBase);
  if(!CAB || !t || bank!==t.questions || (me&&me.role==='teacher')){ box.innerHTML=''; return; }
  if(sentFor===results){ box.innerHTML=`<div class="sent">✓ Работа отправлена учителю</div>`; return; }
  if(!me){
    box.innerHTML=`<button class="btn ghost" onclick="cabLogin(()=>finishEarly())">Войти, чтобы отправить работу учителю</button>`;
    return;
  }
  const left=bank.filter((q,i)=>!results[i]).length;
  box.innerHTML=`
    <button class="btn" id="sendbtn" onclick="sendWork()">Отправить работу учителю</button>
    ${left?`<div class="resnote">Без ответа: ${left} из ${bank.length}. Их тоже можно отправить пустыми.</div>`:''}`;
}
async function sendWork(){
  const btn=$('#sendbtn'); busy(btn,true,'Отправляем…');
  const p1=[], p2=[];
  bank.forEach((q,i)=>{
    const r=results[i];
    if(isP2(q)) p2.push({ i, n:q.n||'', pts:parseInt(q.pts,10)||0, text:(r&&r.user)||getAns(q)||'' });
    else p1.push({ i, n:q.n||String(i+1), user:(r&&r.user)||'', ok:!!(r&&r.ok) });
  });
  const row={
    student_id: me.id, test_name: curBase,
    p1, p1_total: p1.length, p1_score: p1.filter(x=>x.ok).length,
    p2, p2_max: p2.reduce((s,x)=>s+x.pts,0),
  };
  const { error } = await sb.from('submissions').insert(row);
  if(error){ busy(btn,false,'Отправить работу учителю'); toast('Не отправилось: '+error.message); return; }
  sentFor=results; renderSendBox(); toast('Работа отправлена');
}

/* ---------- кабинет ученика ---------- */
function statusLine(s){
  const p1 = s.p1_total ? `Часть 1: ${s.p1_score}/${s.p1_total}` : '';
  let p2 = '';
  if(s.p2 && s.p2.length) p2 = s.checked_at ? `Часть 2: ${s.p2_score}/${s.p2_max}` : 'Часть 2: на проверке';
  return [p1,p2].filter(Boolean).join(' · ');
}
function subBadge(s){
  if(!(s.p2&&s.p2.length)) return '';
  return s.checked_at ? '<span class="st-ok">проверено</span>' : '<span class="st-wait">ждёт проверки</span>';
}
async function cabStudent(){
  cabShow(`<div class="cab"><div class="cab-top"><h2 class="cab-h">${esc(me.full_name)}</h2>
    <button class="linkbtn" onclick="doLogout()">Выйти</button></div>
    <p class="cab-sub">Логин: ${esc(me.login)}</p><div id="clist" class="cab-load">Загружаем работы…</div></div>`);
  const { data, error } = await sb.from('submissions')
    .select('id,test_name,created_at,p1_score,p1_total,p2,p2_max,p2_score,checked_at')
    .order('created_at',{ascending:false}).limit(300);
  const box=$('#clist'); if(!box) return;
  if(error){ box.textContent='Не удалось загрузить: '+error.message; return; }
  box.className='';
  box.innerHTML = data.length ? `<h3 class="cab-h3">Мои работы</h3><div class="tlist">${data.map(s=>`
      <div class="tcard" onclick="cabSubmission(${s.id})">
        <div class="tinfo"><div class="tname">${esc(s.test_name)}</div>
          <div class="tmeta">${fmtDate(s.created_at)} · ${statusLine(s)}</div></div>
        ${subBadge(s)}<span class="tgo">→</span>
      </div>`).join('')}</div>`
    : `<div class="empty">Отправленных работ пока нет.<br>Реши тест и нажми «Отправить работу учителю» на экране результата.</div>`;
  box.innerHTML += `<button class="btn ghost" onclick="home()">К тестам</button>`;
}

/* ---------- одна работа: просмотр (ученик) и проверка (учитель) ---------- */
let curSub=null;
async function cabSubmission(id){
  cabShow(`<div class="cab-load">Загружаем работу…</div>`);
  const { data:s, error } = await sb.from('submissions').select('*').eq('id',id).single();
  if(error||!s){ cabShow(`<div class="empty">Работа не найдена</div><button class="btn ghost" onclick="openCabinet()">Назад</button>`); return; }
  let who='';
  if(me.role==='teacher'){
    const { data:p } = await sb.from('profiles').select('full_name,login').eq('id',s.student_id).single();
    who = p ? `${esc(p.full_name)} · ` : '';
  }
  curSub=s;
  const t=findTest(s.test_name), qs=t?t.questions:[];
  const teacher=me.role==='teacher', g=s.grades||{};
  const p1chips=s.p1.map(x=>`<span class="qn ${x.user?(x.ok?'ok':'bad'):''}" title="Ответ: ${esc(x.user||'—')}">${esc(String(x.n))}</span>`).join('');
  const p1rows=s.p1.map(x=>{ const q=qs[x.i];
    return `<div class="rev"><span class="rn">${esc(String(x.n))}</span>
      <span class="rd">${x.ok?`<span class="g">${esc(x.user)}</span>`:`<span class="y">${esc(x.user||'—')}</span><span class="g">${q?esc(q.answer):''}</span>`}</span></div>`; }).join('');
  const p2items=s.p2.map(x=>{ const q=qs[x.i], gr=g[x.i]||{};
    const scoreCtl = teacher
      ? `<div class="grade"><span class="uans-lab" style="margin:0">Баллы</span>
          <div class="pts" data-i="${x.i}">${Array.from({length:(x.pts||0)+1},(_,k)=>
            `<button class="qn${gr.score===k?' done cur':''}" onclick="pickPts(this,${k})">${k}</button>`).join('')}</div>
          <span class="pmax">из ${x.pts}</span></div>
        <textarea class="essay cm" data-i="${x.i}" placeholder="Комментарий к ответу (увидит ученик)">${esc(gr.comment||'')}</textarea>`
      : (s.checked_at
          ? `<div class="gres">Баллы: <b>${gr.score??0}</b> из ${x.pts}</div>${gr.comment?`<div class="uans-lab">Комментарий учителя</div><div class="uans tc">${esc(gr.comment)}</div>`:''}`
          : `<div class="gres wait">На проверке</div>`);
    return `<div class="allitem">
      <div class="qhead"><span class="qnum">Задание ${esc(x.n)} · часть 2</span><span class="qtype">до ${x.pts} б.</span></div>
      ${q?`<details class="qfold"><summary>Текст задания</summary><div class="p2text">${fmtLong(q.text)}</div></details>`:''}
      <div class="uans-lab">${teacher?'Ответ ученика':'Твой ответ'}</div>
      <div class="uans${x.text?'':' none'}">${x.text?esc(x.text):'Ответ не написан'}</div>
      ${scoreCtl}
    </div>`; }).join('');
  const total = s.checked_at&&s.p2.length ? `<div class="sumline">Часть 2: <b>${s.p2_score}</b> из ${s.p2_max}</div>` : '';
  cabShow(`
    <div class="cab">
      <button class="linkbtn back" onclick="openCabinet()">← Назад</button>
      <h2 class="cab-h" style="margin-top:10px">${esc(s.test_name)}</h2>
      <p class="cab-sub">${who}${fmtDate(s.created_at)}</p>
      ${s.p1_total?`<div class="sumline">Часть 1: <b>${s.p1_score}</b> из ${s.p1_total}</div>
        <div class="chips">${p1chips}</div>
        <button class="etog" onclick="tog(this)">Показать разбор</button>
        <div class="expl"><div class="expl-inner">${p1rows}</div></div>`:''}
      ${s.p2.length?`<div class="review"><h3>Часть 2</h3></div>${total}${p2items}`:''}
      ${teacher&&s.p2.length?`
        <div class="uans-lab">Общий комментарий</div>
        <textarea class="essay cm" id="gcm" placeholder="Необязательно">${esc(s.comment||'')}</textarea>
        <button class="btn" id="gsave" style="margin-top:16px" onclick="saveGrade()">${s.checked_at?'Сохранить изменения':'Сохранить проверку'}</button>`
      : (!teacher&&s.comment?`<div class="uans-lab">Общий комментарий учителя</div><div class="uans tc">${esc(s.comment)}</div>`:'')}
    </div>`);
}
function pickPts(b,k){
  b.parentNode.querySelectorAll('.qn').forEach(x=>x.classList.remove('done','cur'));
  b.classList.add('done','cur'); b.parentNode.dataset.v=k;
}
async function saveGrade(){
  const s=curSub, grades={}; let sum=0, missing=0;
  s.p2.forEach(x=>{
    const box=document.querySelector(`.pts[data-i="${x.i}"]`);
    const sel=box.querySelector('.qn.cur'); const score=sel?parseInt(sel.textContent,10):null;
    if(score===null) missing++;
    const comment=document.querySelector(`textarea.cm[data-i="${x.i}"]`).value.trim();
    grades[x.i]={ score:score??0, comment };
    sum+=score??0;
  });
  if(missing && !confirm(`Не выставлены баллы у ${missing} зад. Считать их за 0?`)) return;
  const btn=$('#gsave'); busy(btn,true,'Сохраняем…');
  const { error } = await sb.from('submissions').update({
    grades, p2_score:sum, comment:$('#gcm').value.trim()||null, checked_at:new Date().toISOString(),
  }).eq('id',s.id);
  if(error){ busy(btn,false,'Сохранить проверку'); toast('Не сохранилось: '+error.message); return; }
  toast('Проверка сохранена: '+sum+' из '+s.p2_max);
  cabTeacher(teacherTab);
}

/* ---------- кабинет учителя ---------- */
let teacherTab='todo', studentsCache=[], filterStudent=null;
async function loadStudents(){
  const { data } = await sb.from('profiles').select('id,login,full_name,role,created_at').eq('role','student').order('full_name');
  studentsCache=data||[]; return studentsCache;
}
function tabsHTML(){
  const T=[['todo','На проверке'],['all','Все работы'],['students','Ученики']];
  return `<div class="tabs">${T.map(([k,l])=>`<button class="tab${teacherTab===k?' on':''}" onclick="cabTeacher('${k}')">${l}</button>`).join('')}</div>`;
}
async function cabTeacher(tab){
  teacherTab=tab||'todo';
  if(teacherTab!=='all') filterStudent=null;
  cabShow(`<div class="cab"><div class="cab-top"><h2 class="cab-h">Проверка</h2>
    <button class="linkbtn" onclick="doLogout()">Выйти</button></div>
    ${tabsHTML()}<div id="tbody" class="cab-load">Загружаем…</div>
    <button class="btn ghost" style="margin-top:22px" onclick="home()">К тестам</button></div>`);
  if(teacherTab==='students') return teacherStudents();
  const [studs] = await Promise.all([loadStudents()]);
  const names=Object.fromEntries(studs.map(p=>[p.id,p.full_name]));
  let q=sb.from('submissions').select('id,student_id,test_name,created_at,p1_score,p1_total,p2,p2_max,p2_score,checked_at')
    .order('created_at',{ascending:teacherTab==='todo'}).limit(500);
  if(teacherTab==='todo') q=q.is('checked_at',null).gt('p2_max',0);
  if(filterStudent) q=q.eq('student_id',filterStudent);
  const { data, error } = await q;
  const box=$('#tbody'); if(!box) return;
  box.className='';
  if(error){ box.textContent='Не удалось загрузить: '+error.message; return; }
  const head = filterStudent ? `<div class="fbar">Ученик: <b>${esc(names[filterStudent]||'')}</b>
      <button class="linkbtn" onclick="filterStudent=null;cabTeacher('all')">показать всех</button></div>` : '';
  box.innerHTML = head + (data.length ? `<div class="tlist">${data.map(s=>`
      <div class="tcard" onclick="cabSubmission(${s.id})">
        <div class="tinfo"><div class="tname">${esc(names[s.student_id]||'Удалённый ученик')}</div>
          <div class="tmeta">${esc(s.test_name)}</div>
          <div class="tmeta">${fmtDate(s.created_at)} · ${statusLine(s)}</div></div>
        ${subBadge(s)}<span class="tgo">→</span>
      </div>`).join('')}</div>`
    : `<div class="empty">${teacherTab==='todo'?'Непроверенных работ нет 🎉':'Работ пока нет'}</div>`);
}
async function teacherStudents(){
  const studs=await loadStudents();
  const { data:subs } = await sb.from('submissions').select('student_id').limit(10000);
  const cnt={}; (subs||[]).forEach(s=>cnt[s.student_id]=(cnt[s.student_id]||0)+1);
  const box=$('#tbody'); if(!box) return;
  box.className='';
  box.innerHTML=`
    <div class="addst">
      <label class="lab" for="names">Добавить учеников — по одному в строке: «Фамилия Имя»</label>
      <textarea id="names" class="essay" style="min-height:120px" placeholder="Иванов Пётр&#10;Смирнова Анна"></textarea>
      <button class="btn" id="addbtn" style="margin-top:12px" onclick="addStudents()">Создать логины и пароли</button>
      <div id="creds"></div>
    </div>
    <h3 class="cab-h3">Ученики · ${studs.length}</h3>
    ${studs.length?`<div class="stable">${studs.map(p=>`
      <div class="srow">
        <div class="sname"><b>${esc(p.full_name)}</b><span>${esc(p.login)} · работ: ${cnt[p.id]||0}</span></div>
        <div class="sact">
          <button class="linkbtn" onclick="filterStudent='${p.id}';teacherTab='all';cabTeacher('all')">Работы</button>
          <button class="linkbtn" onclick="resetPass('${p.id}')">Новый пароль</button>
          <button class="linkbtn danger" onclick="delStudent('${p.id}')">Удалить</button>
        </div>
      </div>`).join('')}</div>`:`<div class="empty">Учеников пока нет</div>`}`;
}
async function callStudents(body){
  const { data, error } = await sb.functions.invoke(FN_STUDENTS,{ body });
  if(error){
    let msg=error.message;
    try{ const j=await error.context.json(); if(j&&j.error) msg=j.error; }catch(e){}
    throw new Error(msg);
  }
  return data;
}
let lastCreds=[];
async function addStudents(){
  const names=$('#names').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ toast('Впиши хотя бы одного ученика'); return; }
  const btn=$('#addbtn'); busy(btn,true,'Создаём… ('+names.length+')');
  try{
    const r=await callStudents({ action:'create', names });
    lastCreds=r.created;
    await teacherStudents();
    $('#creds').innerHTML=credsHTML(r.created, r.failed);
  }catch(e){ busy(btn,false,'Создать логины и пароли'); toast('Ошибка: '+e.message); }
}
function credsHTML(list,failed){
  return `<div class="creds">
    <div class="creds-h">Создано: ${list.length}. Пароли показываются только сейчас — сохрани их.</div>
    ${list.map(c=>`<div class="crow"><span>${esc(c.full_name)}</span><code>${esc(c.login)}</code><code>${esc(c.password)}</code></div>`).join('')}
    ${failed&&failed.length?`<div class="cab-err">Не создано: ${failed.map(f=>esc(f.full_name)+' ('+esc(f.error)+')').join(', ')}</div>`:''}
    <div class="rrow" style="margin-top:12px">
      <button class="btn" onclick="downloadCreds()">Скачать CSV</button>
      <button class="btn ghost" onclick="copyCreds()">Скопировать</button>
    </div></div>`;
}
function credsText(sep){ return ['Ученик','Логин','Пароль'].join(sep)+'\n'+lastCreds.map(c=>[c.full_name,c.login,c.password].join(sep)).join('\n'); }
function downloadCreds(){
  const csv='﻿'+['Ученик;Логин;Пароль'].concat(lastCreds.map(c=>[c.full_name,c.login,c.password].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';'))).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='логины учеников.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function copyCreds(){ try{ await navigator.clipboard.writeText(credsText('\t')); toast('Скопировано'); }catch(e){ toast('Не удалось скопировать'); } }
async function resetPass(id){
  const p=studentsCache.find(x=>x.id===id); if(!p) return;
  if(!confirm('Выдать новый пароль ученику '+p.full_name+'? Старый перестанет работать.')) return;
  try{
    const r=await callStudents({ action:'reset', id });
    lastCreds=[{ full_name:p.full_name, login:p.login, password:r.password }];
    $('#creds').innerHTML=credsHTML(lastCreds,[]);
    $('#creds').scrollIntoView({behavior:'smooth',block:'center'});
  }catch(e){ toast('Ошибка: '+e.message); }
}
async function delStudent(id){
  const p=studentsCache.find(x=>x.id===id); if(!p) return;
  if(!confirm('Удалить ученика '+p.full_name+' вместе со всеми его работами? Это нельзя отменить.')) return;
  try{ await callStudents({ action:'delete', id }); toast('Удалён'); teacherStudents(); }
  catch(e){ toast('Ошибка: '+e.message); }
}

/* ---------- старт ---------- */
if(CAB){
  loadMe();
  sb.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_OUT'){ me=null; paintAcct(); } });
}
paintAcct();
