/* ===== Кабинеты: вход, отправка работ, проверка части 2 ===== */
/* Сервер — функция в Yandex Cloud (папка backend/). Адрес функции: */
const API_URL = window.TRENER_API || 'https://functions.yandexcloud.net/d4epjak23r01meequ6fs';

const CAB = !!API_URL;
let me = null;              // {login, full_name, role, avatar}
let sentFor = null;         // results текущего прохождения, которое уже отправлено
let afterLogin = null;
let submitted = new Set();  // названия ДЗ, которые ученик уже отправлял — по ним ответы открыты

/* ученик видит правильные ответы и пояснения только в ДЗ, которое уже отправил; в разборе — всегда */
function answersLocked(){
  return !!(CAB && me && me.role!=='teacher' && !review && !submitted.has(curBase));
}
async function loadSubmitted(){
  submitted=new Set();
  if(me && me.role!=='teacher'){ try{ (await api('my_subs')).subs.forEach(s=>submitted.add(s.test_name)); }catch(e){} }
}

function cabEl(){ return document.getElementById('acct'); }
function firstName(n){ const p=(n||'').trim().split(/\s+/); return p[1]||p[0]||''; }
function fmtDate(s){ const d=new Date(s);
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
function findTest(name){ return tests.find(t=>t.builtin&&t.name===name)||tests.find(t=>t.name===name); }
function cabShow(html){
  $('#bars').style.display='none'; $('#foot').textContent='';
  app.className='panel fade'; app.innerHTML=html; window.scrollTo({top:0});
}
/* запрос к серверу: text/plain, чтобы браузер не делал предварительный CORS-запрос; токен — в теле */
function getToken(){ try{ return localStorage.getItem('tr_token')||''; }catch(e){ return ''; } }
function setToken(t){ try{ t?localStorage.setItem('tr_token',t):localStorage.removeItem('tr_token'); }catch(e){} }
async function api(action, data){
  let r;
  try{
    r=await fetch(API_URL,{ method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify({ action, token:getToken(), ...(data||{}) }) });
  }catch(e){ throw new Error('Нет связи с сервером. Проверь интернет.'); }
  let j={}; try{ j=await r.json(); }catch(e){}
  if(r.status===401 && action!=='login'){ setToken(''); me=null; paintAcct(); }
  if(!r.ok) throw new Error(j.error||('Ошибка сервера ('+r.status+')'));
  return j;
}
function busy(btn,on,text){ if(!btn)return; btn.disabled=on; if(text) btn.textContent=text; btn.style.opacity=on?.6:1; }

/* ---------- сессия ---------- */
async function loadMe(){
  me=null;
  if(getToken()){ try{ me=(await api('me')).me; }catch(e){} }
  await loadSubmitted();
  paintAcct();
}
/* серая фигурка по плечи — если своей картинки нет */
const AVA_DEFAULT=`<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="#d5d5da"/>
  <circle cx="20" cy="15.5" r="7.2" fill="#9d9da6"/><path d="M5 40c0-8.6 6.7-14.5 15-14.5S35 31.4 35 40z" fill="#9d9da6"/></svg>`;
function avaInner(u){ return u&&u.avatar ? `<img src="${u.avatar.replace(/"/g,'')}" alt="">` : AVA_DEFAULT; }
function paintAcct(){
  const b=cabEl(); if(!b) return;
  if(!CAB){ b.style.display='none'; return; }
  b.style.display='';
  if(me && me.role!=='teacher'){
    b.className='ava'; b.innerHTML=avaInner(me); b.title='Мой профиль'; b.setAttribute('aria-label','Мой профиль');
  }else{
    b.className='acct'; b.textContent = me ? 'Проверка' : 'Войти'; b.removeAttribute('title'); b.removeAttribute('aria-label');
  }
  b.onclick = ()=> me ? openCabinet() : cabLogin();
  const hi=document.getElementById('landhi'); if(hi) hi.textContent = me ? 'Привет, '+firstName(me.full_name)+'!' : 'Привет!';
}
function pickAvatar(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files[0]; if(f) setAvatarFile(f); };
  inp.click();
}
/* уменьшаем до 160×160, обрезая по центру, и сохраняем как JPEG (~10 КБ) */
function setAvatarFile(f){
  const url=URL.createObjectURL(f), img=new Image();
  img.onload=async()=>{
    URL.revokeObjectURL(url);
    const S=160, c=document.createElement('canvas'); c.width=c.height=S;
    const k=Math.min(img.width,img.height), sx=(img.width-k)/2, sy=(img.height-k)/2;
    c.getContext('2d').drawImage(img,sx,sy,k,k,0,0,S,S);
    await saveAvatar(c.toDataURL('image/jpeg',0.85));
  };
  img.onerror=()=>{ URL.revokeObjectURL(url); toast('Не получилось открыть картинку'); };
  img.src=url;
}
async function saveAvatar(data){
  try{ await api('set_avatar',{ img:data }); }catch(e){ toast('Не сохранилось: '+e.message); return; }
  me.avatar=data; paintAcct();
  const big=document.getElementById('avabig'); if(big) big.innerHTML=avaInner(me);
  const rm=document.getElementById('avarm'); if(rm) rm.style.display=data?'':'none';
  toast(data?'Фото обновлено':'Фото убрано');
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
  try{ const r=await api('login',{ login, password:pass }); setToken(r.token); me=r.me; }
  catch(e){ busy(btn,false,'Войти'); $('#lerr').textContent=e.message; return; }
  await loadSubmitted();
  paintAcct();
  toast('Привет, '+firstName(me.full_name)+'!');
  const f=afterLogin; afterLogin=null;
  f ? f() : openCabinet();
}
function doLogout(){ setToken(''); me=null; submitted=new Set(); paintAcct(); home(); }

/* первый вход учителя: адрес сайта с #setup и код из настроек функции */
function cabSetup(){
  cabShow(`
    <div class="cab">
      <h2 class="cab-h">Аккаунт учителя</h2>
      <p class="cab-sub">Создаётся один раз. Код настройки выдаёт тот, кто разворачивал сервер.</p>
      <label class="lab" for="sc">Код настройки</label><input id="sc" class="tin" autocomplete="off">
      <label class="lab" for="sn" style="margin-top:14px">Имя (увидят ученики)</label><input id="sn" class="tin" value="Маша">
      <label class="lab" for="sl" style="margin-top:14px">Логин</label><input id="sl" class="tin" autocapitalize="off" spellcheck="false" placeholder="латиницей, например masha">
      <label class="lab" for="sp" style="margin-top:14px">Пароль (не короче 8 символов)</label><input id="sp" class="tin" type="password" autocomplete="new-password">
      <div class="cab-err" id="lerr"></div>
      <button class="btn" id="lbtn" onclick="doSetup()">Создать</button>
    </div>`);
}
async function doSetup(){
  const btn=$('#lbtn'); busy(btn,true,'Создаём…');
  try{
    const r=await api('setup',{ code:$('#sc').value.trim(), full_name:$('#sn').value.trim(), login:$('#sl').value.trim().toLowerCase(), password:$('#sp').value });
    setToken(r.token); me=r.me; paintAcct(); history.replaceState(null,'',location.pathname); toast('Готово! Вы вошли как учитель'); cabTeacher('students');
  }catch(e){ busy(btn,false,'Создать'); $('#lerr').textContent=e.message; }
}
async function changePass(){
  const old=prompt('Текущий пароль'); if(!old) return;
  const np=prompt('Новый пароль (не короче 8 символов)'); if(!np) return;
  try{ await api('change_password',{ old, password:np }); toast('Пароль изменён'); }catch(e){ toast(e.message); }
}

/* ---------- главная: карточка профиля ---------- */
async function landExtra(){
  const box=document.getElementById('landextra'); if(!box||!CAB) return;
  paintAcct();
  if(!me){ box.innerHTML=''; return; }
  if(me.role==='teacher'){
    let count=0; try{ count=(await api('todo_count')).count; }catch(e){}
    box.innerHTML=`<div class="land-card" onclick="cabTeacher('todo')"><div><b>${count||0}</b></div><span>работ ждут проверки →</span></div>`;
    return;
  }
  let lessons=[];
  try{ lessons=(await api('lessons_list')).lessons; }catch(e){}
  if(!document.getElementById('landextra')) return;
  box.innerHTML=deadlinesHTML(lessons);
}

/* ---------- дедлайны: невыполненные уроки (ДЗ не отправлено), у которых срок близко или прошёл ---------- */
const DAY=864e5;
function fmtDeadline(iso){ const d=new Date(iso);
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+', '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
function daysWord(n){ const a=n%10,b=n%100; return n+' '+(a===1&&b!==11?'день':(a>=2&&a<=4&&(b<10||b>=20)?'дня':'дней')); }
function deadlineBadge(iso){
  const ms=+new Date(iso)-Date.now();
  if(ms<0){ const d=Math.floor(-ms/DAY); return d<1?'просрочено сегодня':'просрочено на '+daysWord(d); }
  // по календарным дням: «завтра» — это завтрашняя дата, а не «через 24 часа»
  const day=x=>{ const t=new Date(x); t.setHours(0,0,0,0); return +t; };
  const d=Math.round((day(iso)-day(Date.now()))/DAY);
  if(d<1) return ms<3*36e5?'осталось меньше 3 часов':'сегодня';
  return d===1?'завтра':d===2?'послезавтра':'через '+daysWord(d);
}
function lessonDone(l){ return !!(l.test_name && submitted.has(l.test_name)); }
function deadlinesHTML(lessons){
  const now=Date.now(), t=l=>+new Date(l.deadline);
  const open=lessons.filter(l=>l.deadline && l.test_name && !lessonDone(l));
  const soon=open.filter(l=>t(l)>=now).sort((a,b)=>t(a)-t(b));
  const over=open.filter(l=>t(l)<now).sort((a,b)=>t(b)-t(a));           // сначала недавно просроченные
  // порядок срочности: ближайшая неделя → просроченные → остальные будущие
  const order=[...soon.filter(l=>t(l)-now<=7*DAY), ...over, ...soon.filter(l=>t(l)-now>7*DAY)];
  const top=order.slice(0,3), rest=over.filter(l=>!top.includes(l));
  const row=l=>{ const o=t(l)<now, hot=!o&&t(l)-now<2*DAY;
    return `<div class="dl${o?' over':hot?' hot':''}" onclick="lessonView('${esc(l.id)}')">
      <div class="dl-t"><b>${esc(l.title)}</b><span>ДЗ до ${fmtDeadline(l.deadline)}</span></div>
      <span class="dl-b">${deadlineBadge(l.deadline)}</span></div>`; };
  return `<div class="dl-h">Дедлайны</div>
    ${top.length?`<div class="dl-list">${top.map(row).join('')}</div>`:`<div class="dl-empty">Горящих дедлайнов нет — всё сдано вовремя.</div>`}
    ${rest.length?`<button class="btn ghost dl-more" onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden;
        this.textContent=this.nextElementSibling.hidden?'Ещё просроченные дедлайны (${rest.length})':'Скрыть'">Ещё просроченные дедлайны (${rest.length})</button>
      <div class="dl-list" style="margin-top:8px" hidden>${rest.map(row).join('')}</div>`:''}`;
}

/* ---------- отправка работы (на экране результата) ---------- */
function renderSendBox(){
  const box=document.getElementById('sendbox'); if(!box) return;
  const t=findTest(curBase);
  if(!CAB || review || !t || bank!==t.questions || (me&&me.role==='teacher')){ box.innerHTML=''; return; }
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
  try{ await api('submit',{ test_name:curBase, p1, p2 }); }
  catch(e){ busy(btn,false,'Отправить работу учителю'); toast('Не отправилось: '+e.message); return; }
  sentFor=results; submitted.add(curBase); toast('Работа отправлена — ответы и пояснения открыты');
  finishEarly();
}

/* ---------- кабинет ученика ---------- */
function statusLine(s){
  const p1 = s.p1_total ? `Часть 1: ${s.p1_score}/${s.p1_total}` : '';
  let p2 = '';
  if(s.p2_n) p2 = s.checked_at ? `Часть 2: ${s.p2_score}/${s.p2_max}` : 'Часть 2: на проверке';
  return [p1,p2].filter(Boolean).join(' · ');
}
function subBadge(s){
  if(!s.p2_n) return '';
  return s.checked_at ? '<span class="st-ok">проверено</span>' : '<span class="st-wait">ждёт проверки</span>';
}
async function cabStudent(){
  cabShow(`<div class="cab">
    <div class="prof">
      <button class="ava-big" id="avabig" onclick="pickAvatar()" title="Сменить фото">${avaInner(me)}</button>
      <div style="min-width:0">
        <h2 class="cab-h">${esc(me.full_name)}</h2>
        <p class="cab-sub">Логин: ${esc(me.login)}</p>
        <div class="prof-act">
          <button class="linkbtn" onclick="pickAvatar()">Сменить фото</button>
          <button class="linkbtn back" id="avarm" onclick="saveAvatar(null)" style="${me.avatar?'':'display:none'}">Убрать</button>
          <button class="linkbtn back" onclick="doLogout()">Выйти</button>
        </div>
      </div>
    </div>
    <div id="clist" class="cab-load">Загружаем работы…</div></div>`);
  let data;
  try{ data=(await api('my_subs')).subs.sort((a,b)=>b.created_at.localeCompare(a.created_at)); }
  catch(e){ const b=$('#clist'); if(b) b.textContent='Не удалось загрузить: '+e.message; return; }
  const box=$('#clist'); if(!box) return;
  box.className='';
  box.innerHTML = `<h3 class="cab-h3">Прогресс</h3><div id="prog"></div>` + (data.length ? `<h3 class="cab-h3">Мои работы</h3><div class="tlist">${data.map(s=>`
      <div class="tcard" onclick="cabSubmission('${s.id}')">
        <div class="tinfo"><div class="tname">${esc(s.test_name)}</div>
          <div class="tmeta">${fmtDate(s.created_at)} · ${statusLine(s)}</div></div>
        ${subBadge(s)}<span class="tgo">→</span>
      </div>`).join('')}</div>`
    : `<div class="empty">Отправленных работ пока нет.<br>Реши ДЗ и нажми «Отправить работу учителю» на экране результата.</div>`);
  box.innerHTML += `<button class="btn ghost" onclick="hwList()">К ДЗ</button>`;
  drawProgress($('#prog'), data);
}

/* ---------- прогресс: % баллов за каждую итоговую работу + линия тренда ---------- */
/* работа попадает в прогресс, когда её итог известен: проверена учителем или в ней нет части 2 */
function progressPoints(subs){
  return subs.filter(s=>!s.p2_n||s.checked_at)
    .map(s=>{ const max=(s.p1_total||0)+(s.p2_n?(s.p2_max||0):0), got=(s.p1_score||0)+(s.p2_score||0);
      return max?{ s, got, max, pct:Math.round(got/max*100) }:null; })
    .filter(Boolean)
    .sort((a,b)=>new Date(a.s.created_at)-new Date(b.s.created_at));
}
function trendLine(ys){ const n=ys.length; if(n<2) return null;
  const mx=(n-1)/2, my=ys.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0; ys.forEach((y,x)=>{ num+=(x-mx)*(y-my); den+=(x-mx)*(x-mx); });
  const k=num/den; return { k, at:x=>my+k*(x-mx) }; }
function drawProgress(el, subs){
  if(!el) return;
  const pts=progressPoints(subs||[]), wait=(subs||[]).filter(s=>s.p2_n&&!s.checked_at).length;
  const waitNote = wait ? `<div class="pnote">${wait===1?'Ещё 1 работа ждёт проверки — появится на графике после неё.':'Ещё '+wait+' работ(ы) ждут проверки — появятся на графике после неё.'}</div>` : '';
  if(!pts.length){ el.innerHTML=`<div class="empty" style="margin-bottom:0">График появится, когда будет проверена первая работа.</div>${waitNote}`; return; }
  const ys=pts.map(p=>p.pct), avg=Math.round(ys.reduce((a,b)=>a+b,0)/ys.length), tr=trendLine(ys);
  const dir = tr ? (Math.abs(tr.k)<0.5?'ровно':(tr.k>0?'+':'−')+Math.abs(tr.k).toFixed(1)) : '—';
  el.innerHTML=`
    <div class="pstats">
      <div class="pstat"><b>${avg}%</b><span>средний результат</span></div>
      <div class="pstat"><b>${ys[ys.length-1]}%</b><span>последняя работа</span></div>
      <div class="pstat"><b>${dir}</b><span>${tr?'тренд, п.п. за работу':'тренд — после 2 работ'}</span></div>
    </div>
    <div class="plegend"><span><i class="lb"></i>% баллов за работу</span>${tr?'<span><i class="lt"></i>тренд</span>':''}</div>
    <div class="pchart" id="pchart" role="img" aria-label="Результаты по работам: ${ys.join('%, ')}%"></div>
    ${waitNote}`;
  const box=el.querySelector('#pchart');
  const paint=()=>{
    const W=box.clientWidth, H=210, L=34, R=6, T=10, B=24, iw=W-L-R, ih=H-T-B, n=pts.length;
    const step=iw/n, bw=Math.max(4,Math.min(28,step-2)), y=v=>T+ih-(v/100)*ih;
    let g='';
    [0,50,100].forEach(v=>{ g+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}%</text>`; });
    const every=Math.max(1,Math.ceil(n/Math.floor(iw/30)));
    pts.forEach((p,i)=>{
      const cx=L+step*i+step/2, x=cx-bw/2, top=y(p.pct), h=T+ih-top, r=Math.min(4,bw/2,h);
      g+= h>0 ? `<path class="bar" data-i="${i}" d="M${x},${T+ih}V${top+r}Q${x},${top} ${x+r},${top}H${x+bw-r}Q${x+bw},${top} ${x+bw},${top+r}V${T+ih}Z"/>`
              : `<rect class="bar" data-i="${i}" x="${x}" y="${T+ih-1}" width="${bw}" height="1"/>`;
      if(i%every===0||i===n-1) g+=`<text class="ax" x="${cx}" y="${H-6}" text-anchor="middle">${i+1}</text>`;
    });
    if(tr){ const x1=L+step/2, x2=L+step*(n-1)+step/2, c=v=>Math.max(0,Math.min(100,v));
      g+=`<line class="trend" x1="${x1}" y1="${y(c(tr.at(0)))}" x2="${x2}" y2="${y(c(tr.at(n-1)))}"/>`; }
    pts.forEach((p,i)=>{ g+=`<rect class="hit" data-i="${i}" x="${L+step*i}" y="${T}" width="${step}" height="${ih}"/>`; });
    box.innerHTML=`<svg width="${W}" height="${H}">${g}</svg><div class="ptip" id="ptip"></div>`;
    const tip=box.querySelector('#ptip');
    box.querySelectorAll('.hit').forEach(h=>{
      const i=+h.dataset.i, p=pts[i];
      const show=()=>{ box.classList.add('hov'); box.querySelectorAll('.bar').forEach(b=>b.classList.toggle('on',+b.dataset.i===i));
        tip.innerHTML=`<b>${p.pct}%</b> · ${p.got} из ${p.max} б.<br>${esc(p.s.test_name)}<br>${fmtDate(p.s.created_at)}`;
        const cx=L+step*i+step/2; tip.style.left=Math.max(80,Math.min(W-80,cx))+'px'; tip.style.top=y(p.pct)+'px'; tip.classList.add('show'); };
      const hide=()=>{ box.classList.remove('hov'); tip.classList.remove('show'); };
      h.addEventListener('mouseenter',show); h.addEventListener('mouseleave',hide);
      h.addEventListener('click',show);
    });
  };
  paint();
  let rt; const ro=new ResizeObserver(()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(document.body.contains(box)) paint(); else ro.disconnect(); },80); });
  ro.observe(box);
}

/* ---------- одна работа: просмотр (ученик) и проверка (учитель) ---------- */
let curSub=null;
async function cabSubmission(id){
  cabShow(`<div class="cab-load">Загружаем работу…</div>`);
  let s;
  try{ s=(await api('sub_get',{ id })).sub; }
  catch(e){ cabShow(`<div class="empty">${esc(e.message)}</div><button class="btn ghost" onclick="openCabinet()">Назад</button>`); return; }
  const who = me.role==='teacher' && s.student_name ? `${esc(s.student_name)} · ` : '';
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
      ${t?`<button class="btn ghost" style="margin-bottom:22px" onclick="openReview()">Открыть ДЗ с пояснениями</button>`:''}
      ${s.p1_total?`<div class="sumline">Часть 1: <b>${s.p1_score}</b> из ${s.p1_total}</div>
        <div class="chips">${p1chips}</div>
        <button class="etog" onclick="tog(this)">Показать разбор</button>
        <div class="expl"><div class="expl-inner">${p1rows}</div></div>`:''}
      ${s.p2.length?`<div class="review"><h3>Часть 2</h3></div>${total}${p2items}`:''}
      ${teacher&&s.p2.length?`
        <div class="gfoot">
          <div><div class="uans-lab">Общий комментарий</div>
            <textarea class="essay cm" id="gcm" placeholder="Необязательно">${esc(s.comment||'')}</textarea></div>
          <div><div class="uans-lab">Файлы к проверке</div>
            <div class="flist" id="gfiles"></div>
            <button class="fdrop" id="gdrop" onclick="pickGradeFiles()">+ Прикрепить файл<br><span style="font-weight:400;font-size:12px">или перетащите сюда</span></button></div>
        </div>
        <button class="btn" id="gsave" style="margin-top:16px" onclick="saveGrade()">${s.checked_at?'Сохранить изменения':'Сохранить проверку'}</button>`
      : (!teacher&&s.checked_at?`${s.comment?`<div class="uans-lab">Общий комментарий учителя</div><div class="uans tc">${esc(s.comment)}</div>`:''}
        ${(s.files||[]).length?`<div class="uans-lab">Файлы от учителя</div><div class="flist" style="margin-top:8px">${fileLinksHTML(s.files)}</div>`:''}`:'')}
    </div>`);
  if(teacher&&s.p2.length) initGradeFiles(s);
}
/* файлы, которые учитель прикрепляет к проверке */
let gradeFiles=[];
function paintGradeFiles(){ const box=$('#gfiles'); if(box) box.innerHTML=fileRowsHTML(gradeFiles,'rmGradeFile'); }
function rmGradeFile(i){ gradeFiles.splice(i,1); paintGradeFiles(); }
function pickGradeFiles(){
  const inp=document.createElement('input'); inp.type='file'; inp.multiple=true;
  inp.onchange=()=>[...inp.files].forEach(f=>uploadFileTo(gradeFiles, f, 'grade', paintGradeFiles));
  inp.click();
}
function initGradeFiles(s){
  gradeFiles=(s.files||[]).map(f=>({ key:f.key, name:f.name, size:f.size }));
  paintGradeFiles();
  const d=$('#gdrop'); if(!d) return;
  d.addEventListener('dragover',e=>{ e.preventDefault(); d.classList.add('over'); });
  d.addEventListener('dragleave',()=>d.classList.remove('over'));
  d.addEventListener('drop',e=>{ e.preventDefault(); d.classList.remove('over');
    [...e.dataTransfer.files].forEach(f=>uploadFileTo(gradeFiles, f, 'grade', paintGradeFiles)); });
}
/* разбор отправленной работы в самом тесте: ответы, правильные ответы, пояснения, оценки */
function openReview(){
  const s=curSub, t=findTest(s.test_name); if(!t) return;
  bank=t.questions; curId=t.id; curBase=t.name; curName=t.name+' · разбор';
  results=[]; score=0;
  (s.p1||[]).forEach(x=>{ const q=bank[x.i]; if(q&&x.user){ results[x.i]={q,n:q.n,user:x.user,answer:norm(q.answer),ok:!!x.ok}; if(x.ok) score++; } });
  (s.p2||[]).forEach(x=>{ const q=bank[x.i]; if(q&&x.text) results[x.i]={q,n:q.n,user:x.text,p2:true}; });
  review={ sub:s }; idx=0; render(); window.scrollTo({top:0});
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
  if(gradeFiles.some(f=>f.status==='загружается…')){ toast('Подождите, файлы ещё загружаются'); return; }
  if(missing && !confirm(`Не выставлены баллы у ${missing} зад. Считать их за 0?`)) return;
  const btn=$('#gsave'); busy(btn,true,'Сохраняем…');
  try{ await api('grade',{ id:s.id, grades, comment:$('#gcm').value.trim()||null,
    files:gradeFiles.filter(f=>f.key).map(f=>({ key:f.key, name:f.name, size:f.size })) }); }
  catch(e){ busy(btn,false,'Сохранить проверку'); toast('Не сохранилось: '+e.message); return; }
  toast('Проверка сохранена: '+sum+' из '+s.p2_max);
  cabTeacher(teacherTab);
}

/* ---------- кабинет учителя ---------- */
let teacherTab='todo', studentsCache=[], filterStudent=null;
async function loadStudents(){
  studentsCache=(await api('students_list')).students; return studentsCache;
}
function tabsHTML(){
  const T=[['todo','На проверке'],['all','Все работы'],['lessons','Уроки'],['students','Ученики']];
  return `<div class="tabs">${T.map(([k,l])=>`<button class="tab${teacherTab===k?' on':''}" onclick="cabTeacher('${k}')">${l}</button>`).join('')}</div>`;
}
async function cabTeacher(tab){
  teacherTab=tab||'todo';
  if(teacherTab!=='all') filterStudent=null;
  cabShow(`<div class="cab"><div class="cab-top"><h2 class="cab-h">Проверка</h2>
    <div class="sact"><button class="linkbtn back" onclick="changePass()">Сменить пароль</button><button class="linkbtn" onclick="doLogout()">Выйти</button></div></div>
    ${tabsHTML()}<div id="tbody" class="cab-load">Загружаем…</div>
    <button class="btn ghost" style="margin-top:22px" onclick="hwList()">К ДЗ</button></div>`);
  if(teacherTab==='students') return teacherStudents();
  if(teacherTab==='lessons') return teacherLessons();
  let studs, data;
  try{
    [studs, data] = await Promise.all([loadStudents(),
      api('subs_list',{ todo:teacherTab==='todo', student:filterStudent||undefined }).then(r=>r.subs)]);
  }catch(e){ const b=$('#tbody'); if(b){ b.className=''; b.textContent='Не удалось загрузить: '+e.message; } return; }
  const names=Object.fromEntries(studs.map(p=>[p.login,p.full_name]));
  const box=$('#tbody'); if(!box) return;
  box.className='';
  const head = filterStudent ? `<div class="fbar">Ученик: <b>${esc(names[filterStudent]||'')}</b>
      <button class="linkbtn" onclick="filterStudent=null;cabTeacher('all')">показать всех</button></div>
      <div id="prog" style="margin-bottom:18px"></div>` : '';
  box.innerHTML = head + (data.length ? `<div class="tlist">${data.map(s=>`
      <div class="tcard" onclick="cabSubmission('${s.id}')">
        <div class="tinfo"><div class="tname">${esc(names[s.student]||'Удалённый ученик')}</div>
          <div class="tmeta">${esc(s.test_name)}</div>
          <div class="tmeta">${fmtDate(s.created_at)} · ${statusLine(s)}</div></div>
        ${subBadge(s)}<span class="tgo">→</span>
      </div>`).join('')}</div>`
    : `<div class="empty">${teacherTab==='todo'?'Непроверенных работ нет 🎉':'Работ пока нет'}</div>`);
  if(filterStudent) drawProgress($('#prog'), data);
}
async function teacherStudents(){
  let studs;
  try{ studs=await loadStudents(); }
  catch(e){ const b=$('#tbody'); if(b){ b.className=''; b.textContent='Не удалось загрузить: '+e.message; } return; }
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
        <div class="sname"><b>${esc(p.full_name)}</b><span>${esc(p.login)} · работ: ${p.subs||0}</span></div>
        <div class="sact">
          <button class="linkbtn" onclick="filterStudent='${esc(p.login)}';teacherTab='all';cabTeacher('all')">Работы</button>
          <button class="linkbtn" onclick="resetPass('${esc(p.login)}')">Новый пароль</button>
          <button class="linkbtn danger" onclick="delStudent('${esc(p.login)}')">Удалить</button>
        </div>
      </div>`).join('')}</div>`:`<div class="empty">Учеников пока нет</div>`}`;
}
let lastCreds=[];
async function addStudents(){
  const names=$('#names').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ toast('Впиши хотя бы одного ученика'); return; }
  const btn=$('#addbtn'); busy(btn,true,'Создаём… ('+names.length+')');
  try{
    const r=await api('students_create',{ names });
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
async function resetPass(login){
  const p=studentsCache.find(x=>x.login===login); if(!p) return;
  if(!confirm('Выдать новый пароль ученику '+p.full_name+'? Старый перестанет работать.')) return;
  try{
    const r=await api('student_reset',{ login });
    lastCreds=[{ full_name:p.full_name, login:p.login, password:r.password }];
    $('#creds').innerHTML=credsHTML(lastCreds,[]);
    $('#creds').scrollIntoView({behavior:'smooth',block:'center'});
  }catch(e){ toast('Ошибка: '+e.message); }
}
async function delStudent(login){
  const p=studentsCache.find(x=>x.login===login); if(!p) return;
  if(!confirm('Удалить ученика '+p.full_name+' вместе со всеми его работами? Это нельзя отменить.')) return;
  try{ await api('student_delete',{ login }); toast('Удалён'); teacherStudents(); }
  catch(e){ toast('Ошибка: '+e.message); }
}

/* ---------- уроки ---------- */
/* ученикам тесты видны только через уроки; учителю — всё */
function cabCanSeeTests(){ return !CAB || (me && me.role==='teacher'); }
function cabGoHW(){
  if(!CAB) return hwList();
  if(!me) return cabLogin(()=>cabGoHW());
  return me.role==='teacher' ? hwList() : lessonsList();
}
function fmtDay(s){ return new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}); }
function fmtSize(n){ return n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' МБ':Math.max(1,Math.round(n/1024))+' КБ'; }
function fileExt(n){ const m=/\.([a-z0-9]{1,5})$/i.exec(n||''); return m?m[1].toUpperCase():'ФАЙЛ'; }
/* то же, что на сервере (backend/app.js → videoEmbed): для предпросмотра в редакторе */
function videoEmbed(url){
  let u; try{ u=new URL((url||'').trim()); }catch(e){ return null; }
  const h=u.hostname.replace(/^(www\.|m\.)/,''); let m;
  const yt=id=>/^[\w-]{6,20}$/.test(id||'')?'https://www.youtube.com/embed/'+id:null;
  if(h==='youtu.be') return yt(u.pathname.slice(1).split('/')[0]);
  if(h==='youtube.com'||h==='youtube-nocookie.com'){
    if(u.searchParams.get('v')) return yt(u.searchParams.get('v'));
    if((m=u.pathname.match(/^\/(embed|live|shorts)\/([\w-]+)/))) return yt(m[2]);
  }
  if(h==='rutube.ru' && (m=u.pathname.match(/^\/(?:video|live\/video|play\/embed|shorts)\/(?:private\/)?([0-9a-f]{20,})/i))){
    const p=u.searchParams.get('p'); return 'https://rutube.ru/play/embed/'+m[1]+(p?'?p='+encodeURIComponent(p):'');
  }
  if((h==='vk.com'||h==='vkvideo.ru'||h==='vk.ru') && (m=(u.pathname+u.search).match(/video(-?\d+)_(\d+)/)))
    return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`;
  return null;
}
const videoFrame = src => `<div class="vwrap"><iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

let curLesson=null;
async function lessonsList(){
  cabShow(`<div class="cab">
    <button class="linkbtn back" onclick="home()">← На главную</button>
    <h2 class="cab-h" style="margin:10px 0 18px">Уроки</h2>
    <div id="llist" class="cab-load">Загружаем уроки…</div></div>`);
  let lessons;
  try{ lessons=(await api('lessons_list')).lessons; }
  catch(e){ const b=$('#llist'); if(b) b.textContent='Не удалось загрузить: '+e.message; return; }
  const box=$('#llist'); if(!box) return;
  box.className='';
  box.innerHTML = lessons.length ? `<div class="tlist">${lessons.map(l=>`
    <div class="tcard" onclick="lessonView('${esc(l.id)}')">
      <div class="tinfo"><div class="tname">${esc(l.title)}</div>
        <div class="tmeta">${fmtDay(l.created_at)}${l.test_name?' · ДЗ: '+esc(l.test_name):''}${l.deadline&&l.test_name?' · до '+fmtDeadline(l.deadline):''}${l.files_n?' · файлов: '+l.files_n:''}</div></div>
      ${lessonDone(l)?'<span class="st-ok">сдано</span>':(l.deadline&&l.test_name&&+new Date(l.deadline)<Date.now()?'<span class="st-wait" style="color:var(--bad);background:var(--bad-soft)">просрочено</span>':'')}<span class="tgo">→</span>
    </div>`).join('')}</div>` : `<div class="empty">Уроков пока нет.<br>Когда учитель опубликует урок, он появится здесь.</div>`;
}
async function lessonView(id){
  cabShow(`<div class="cab-load">Загружаем урок…</div>`);
  let l;
  try{ l=(await api('lesson_get',{ id })).lesson; }
  catch(e){ cabShow(`<div class="empty">${esc(e.message)}</div><button class="btn ghost" onclick="goHW()">К урокам</button>`); return; }
  curLesson=l;
  const teacher=me&&me.role==='teacher';
  const t=l.test_name?findTest(l.test_name):null, done=t&&submitted.has(t.name);
  cabShow(`<div class="cab">
    <button class="linkbtn back" onclick="${teacher?"cabTeacher('lessons')":'lessonsList()'}">← ${teacher?'К урокам':'Все уроки'}</button>
    <h2 class="cab-h" style="margin-top:10px">${esc(l.title)}</h2>
    <p class="cab-sub">${fmtDay(l.created_at)}${teacher&&!l.published?' · черновик, ученики не видят':''}</p>
    ${l.embed?videoFrame(l.embed):''}
    ${t?`<div class="hwbox"><div class="lab">Домашнее задание</div><div class="tname">${esc(t.name)}</div>
      <div class="tmeta" style="margin:-6px 0 12px">${metaLine(t.questions)}${done?' · уже сдано':''}</div>
      ${l.deadline?`<div class="hw-dl${!done&&+new Date(l.deadline)<Date.now()?' over':''}">Сдать до ${fmtDeadline(l.deadline)}${done?'':' · '+deadlineBadge(l.deadline)}</div>`:''}
      <button class="btn" onclick="openTest('${esc(t.id)}')">${done?'Решать ещё раз':'Решать ДЗ'}</button></div>`:''}
    ${l.files.length?`<div class="lab">Материалы</div><div class="flist">${fileLinksHTML(l.files)}</div>`:''}
    ${teacher?`<button class="btn ghost" onclick="lessonEdit('${esc(l.id)}')">Редактировать урок</button>`:''}
  </div>`);
}

/* ---- учитель: список и редактор уроков ---- */
async function teacherLessons(){
  let lessons;
  try{ lessons=(await api('lessons_list')).lessons; }
  catch(e){ const b=$('#tbody'); if(b){ b.className=''; b.textContent='Не удалось загрузить: '+e.message; } return; }
  const box=$('#tbody'); if(!box) return;
  box.className='';
  box.innerHTML=`<button class="btn" style="margin-bottom:18px" onclick="lessonEdit(null)">+ Новый урок</button>
    ${lessons.length?`<div class="tlist">${lessons.map(l=>`
      <div class="tcard" onclick="lessonView('${esc(l.id)}')">
        <div class="tinfo"><div class="tname">${esc(l.title)}</div>
          <div class="tmeta">${fmtDay(l.created_at)}${l.test_name?' · ДЗ: '+esc(l.test_name):' · без ДЗ'}${l.deadline?' · до '+fmtDeadline(l.deadline):''}${l.embed?' · видео':''}${l.files_n?' · файлов: '+l.files_n:''}</div></div>
        ${l.published?'<span class="st-ok">опубликован</span>':'<span class="st-draft">черновик</span>'}<span class="tgo">→</span>
      </div>`).join('')}</div>`:`<div class="empty">Уроков пока нет</div>`}`;
}
let editL=null;
async function lessonEdit(id){
  editL={ id:null, title:'', video:'', test_name:'', deadline:'', files:[], published:false };
  if(id){
    cabShow(`<div class="cab-load">Загружаем урок…</div>`);
    try{ const l=(await api('lesson_get',{ id })).lesson; editL={ id:l.id, title:l.title, video:l.video||'', test_name:l.test_name||'',
      deadline:l.deadline||'', files:l.files.map(f=>({ key:f.key, name:f.name, size:f.size })), published:l.published }; }
    catch(e){ toast(e.message); return cabTeacher('lessons'); }
  }
  const opts=groupTests().map(([title,list])=>`<optgroup label="${esc(title)}">${list.map(t=>
    `<option value="${esc(t.name)}"${t.name===editL.test_name?' selected':''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  cabShow(`<div class="cab lform">
    <button class="linkbtn back" onclick="cabTeacher('lessons')">← К урокам</button>
    <h2 class="cab-h" style="margin-top:10px">${editL.id?'Урок':'Новый урок'}</h2>
    <label class="lab" for="lt">Название</label>
    <input id="lt" class="tin" maxlength="200" value="${esc(editL.title)}" placeholder="Например: Выборы и избирательные системы">
    <label class="lab" for="lv">Видео или трансляция — ссылка YouTube, Rutube или VK Видео</label>
    <input id="lv" class="tin" value="${esc(editL.video)}" placeholder="https://rutube.ru/video/…" oninput="lessonVideoPreview()">
    <div id="vprev" class="vprev"></div>
    <label class="lab" for="lh">Домашнее задание</label>
    <select id="lh" class="tin"><option value="">— без ДЗ —</option>${opts}</select>
    <label class="lab" for="ld">Дедлайн ДЗ</label>
    <input id="ld" class="tin" type="datetime-local" value="${toLocalInput(editL.deadline)}">
    <div class="vnote">Можно оставить пустым. Урок попадёт в «Дедлайны» ученика, пока он не отправит это ДЗ.</div>
    <label class="lab">Файлы</label>
    <div class="flist" id="lfiles"></div>
    <button class="btn ghost" onclick="pickLessonFiles()">Прикрепить файлы</button>
    <label class="chk"><input type="checkbox" id="lp"${editL.published?' checked':''}> Опубликовать — ученики увидят урок</label>
    <div class="cab-err" id="lerr"></div>
    <button class="btn" id="lsave" onclick="lessonSave()">Сохранить</button>
    ${editL.id?`<button class="linkfin" style="color:var(--bad)" onclick="lessonDelete()">Удалить урок</button>`:''}
  </div>`);
  lessonVideoPreview(); paintLessonFiles();
}
/* ISO → значение для <input type="datetime-local"> в местном времени */
function toLocalInput(iso){ if(!iso) return ''; const d=new Date(iso), p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function lessonVideoPreview(){
  const v=$('#lv').value.trim(), box=$('#vprev'), src=v&&videoEmbed(v);
  box.innerHTML = !v ? `<div class="vnote">Можно оставить пустым.</div>`
    : src ? videoFrame(src) : `<div class="vnote err">Не понимаю ссылку. Скопируйте адрес видео из браузера или кнопкой «Поделиться».</div>`;
}
function paintLessonFiles(){ const box=$('#lfiles'); if(box) box.innerHTML=fileRowsHTML(editL.files,'rmLessonFile'); }
function rmLessonFile(i){ editL.files.splice(i,1); paintLessonFiles(); }
function pickLessonFiles(){
  const inp=document.createElement('input'); inp.type='file'; inp.multiple=true;
  inp.onchange=()=>{ [...inp.files].forEach(uploadLessonFile); };
  inp.click();
}
/* загрузка файла в хранилище по ссылке от сервера; kind: 'lesson' | 'grade' */
async function uploadFileTo(list, file, kind, repaint){
  const f={ key:null, name:file.name, size:file.size, status:'загружается…' };
  list.push(f); repaint();
  try{
    if(file.size>100*1024*1024) throw new Error('больше 100 МБ');
    const { key, url } = await api('file_upload_url',{ name:file.name, size:file.size, kind });
    const r=await fetch(url,{ method:'PUT', body:file });
    if(!r.ok) throw new Error('хранилище ответило '+r.status);
    f.key=key; f.status=null;
  }catch(e){ f.status='ошибка'; toast('Файл «'+file.name+'» не загрузился: '+e.message); }
  repaint();
}
function uploadLessonFile(file){ return uploadFileTo(editL.files, file, 'lesson', paintLessonFiles); }
function fileRowsHTML(list, removeFn){
  return list.map((f,i)=>`<div class="fitem"><span class="fic">${esc(fileExt(f.name))}</span>
    <span class="fnm">${esc(f.name)}</span>
    ${f.status?`<span class="fst${f.status==='ошибка'?' err':''}">${esc(f.status)}</span>`:`<span class="fsz">${fmtSize(f.size||0)}</span>`}
    ${f.status==='загружается…'?'':`<button class="trm" title="Убрать" onclick="${removeFn}(${i})">✕</button>`}</div>`).join('');
}
function fileLinksHTML(list){
  return list.map(f=>`<a class="fitem" href="${esc(f.url||'#')}" download="${esc(f.name)}" rel="noopener">
    <span class="fic">${esc(fileExt(f.name))}</span><span class="fnm">${esc(f.name)}</span><span class="fsz">${fmtSize(f.size||0)} ↓</span></a>`).join('');
}
async function lessonSave(){
  if(editL.files.some(f=>f.status==='загружается…')){ toast('Подождите, файлы ещё загружаются'); return; }
  const btn=$('#lsave'); busy(btn,true,'Сохраняем…');
  try{
    const r=await api('lesson_save',{ id:editL.id||undefined, title:$('#lt').value.trim(), video:$('#lv').value.trim(),
      test_name:$('#lh').value, published:$('#lp').checked,
      deadline:$('#ld').value?new Date($('#ld').value).toISOString():'',
      files:editL.files.filter(f=>f.key).map(f=>({ key:f.key, name:f.name, size:f.size })) });
    toast(r.lesson.published?'Урок опубликован':'Урок сохранён как черновик');
    lessonView(r.lesson.id);
  }catch(e){ busy(btn,false,'Сохранить'); $('#lerr').textContent=e.message; }
}
async function lessonDelete(){
  if(!confirm('Удалить урок «'+editL.title+'» вместе с файлами? Работы учеников останутся.')) return;
  try{ await api('lesson_delete',{ id:editL.id }); toast('Урок удалён'); cabTeacher('lessons'); }
  catch(e){ toast(e.message); }
}

/* ---------- старт ---------- */
if(CAB){
  if(location.hash==='#setup') cabSetup();
  loadMe().then(()=>{ if(document.getElementById('landextra')) landExtra(); });
}
paintAcct();
