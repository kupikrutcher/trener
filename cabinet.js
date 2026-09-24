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
  return !!(CAB && me && me.role!=='teacher' && !review && !window.bankSel && !submitted.has(curBase));
}
/* ДЗ уже отправлено — ученик может решать заново только часть 1, вторая скрыта */
function p1OnlyFor(t){ return !!(CAB && me && me.role!=='teacher' && t && submitted.has(t.name)); }
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
const AVA_DEFAULT=`<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" style="fill:var(--surface-sunk)"/>
  <circle cx="20" cy="15.5" r="7.2" style="fill:var(--line-strong)"/><path d="M5 40c0-8.6 6.7-14.5 15-14.5S35 31.4 35 40z" style="fill:var(--line-strong)"/></svg>`;
function avaInner(u){ return u&&u.avatar ? `<img src="${u.avatar.replace(/"/g,'')}" alt="">` : AVA_DEFAULT; }
function paintAcct(){
  const b=cabEl(); if(!b) return;
  if(!CAB){ b.style.display='none'; return; }
  b.style.display='';
  if(me && me.role!=='teacher'){
    b.className='ava'; b.innerHTML=avaInner(me); b.title='Мой профиль'; b.setAttribute('aria-label','Мой профиль');
  }else{
    b.className='acct'; b.textContent = me ? 'Личный кабинет' : 'Войти'; b.removeAttribute('title'); b.removeAttribute('aria-label');
  }
  b.onclick = ()=>{ if(window.setNav) setNav(''); me ? openCabinet() : cabLogin(); };
  const chk=document.querySelector('.side-nav [data-nav="check"]'); if(chk) chk.hidden=!(me&&me.role==='teacher');
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
function openCabinet(){ if(!me) return cabLogin(); me.role==='teacher' ? teacherProfile() : cabStudent(); }

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
      <button class="linkfin" onclick="afterLogin=null;home()">Назад</button>
    </div>`);
  const lg=$('#lg'), pw=$('#pw'); lg.focus();
  [lg,pw].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); doLogin(); } }));
}
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
    setToken(r.token); me=r.me; paintAcct(); history.replaceState(null,'',location.pathname); toast('Готово! Вы вошли как учитель'); teacherProfile();
  }catch(e){ busy(btn,false,'Создать'); $('#lerr').textContent=e.message; }
}
async function changePass(){
  const old=prompt('Текущий пароль'); if(!old) return;
  const np=prompt('Новый пароль (не короче 8 символов)'); if(!np) return;
  try{ await api('change_password',{ old, password:np }); toast('Пароль изменён'); }catch(e){ toast(e.message); }
}

/* ---------- главная: карточка профиля ---------- */
async function landExtra(){
  // на главной только приветствие, фото и кнопка; дедлайны — на странице уроков
  const box=document.getElementById('landextra'); if(box) box.innerHTML='';
  paintAcct();
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
  if(CAB && !review && t && curName===curBase && p1OnlyFor(t) && bank!==t.questions){
    box.innerHTML=`<div class="resnote">Работа уже сдана. Это повторное решение первой части — учителю оно не отправляется.</div>`; return; }
  if(!CAB || review || !t || bank!==t.questions || (me&&me.role==='teacher')){ box.innerHTML=''; return; }
  if(sentFor===results){ box.innerHTML=`<div class="sent">✓ Работа отправлена учителю</div>`; return; }
  // одна главная кнопка на экран: если есть «Исправить N ошибок», отправка — второстепенная
  const kind=document.getElementById('fixbtn')?'btn ghost':'btn';
  if(!me){
    box.innerHTML=`<button class="btn ghost" onclick="cabLogin(()=>finishEarly())">Войти, чтобы отправить работу учителю</button>`;
    return;
  }
  const left=bank.filter((q,i)=>!results[i]).length;
  box.innerHTML=`
    <button class="${kind}" id="sendbtn" onclick="sendWork()">Отправить работу учителю</button>
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

/* изменение к прошлой попытке этого же ДЗ (по первой части) — на экране результата */
async function resultDelta(){
  const el=document.getElementById('rsdelta'); if(!el||!CAB||!me||me.role==='teacher') return;
  const t=findTest(curBase); if(!t||review||curName!==curBase) return;   // и полное ДЗ, и повтор только части 1
  const total=countP1(bank); if(!total) return;
  let subs=[]; try{ subs=(await api('my_subs')).subs; }catch(e){ return; }
  subs=subs.filter(s=>s.test_name===curBase&&s.p1_total).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(sentFor===results) subs=subs.slice(1);            // последняя — это только что отправленная
  const prev=subs[0]; if(!prev||!document.getElementById('rsdelta')) return;
  const now=Math.round(score/total*100), was=Math.round(prev.p1_score/prev.p1_total*100), d=now-was;
  el.innerHTML = d===0 ? 'Как в прошлый раз' :
    `<b class="${d>0?'up':'down'}">${d>0?'+':'−'}${Math.abs(d)}%</b> к прошлой попытке`;
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
          <button class="logout" onclick="doLogout()">Выйти</button>
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
      const cx=L+step*i+step/2, x=cx-bw/2, top=y(p.pct), h=T+ih-top, r=0;   // брутализм: без скруглений
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
      <button class="linkbtn back" onclick="${teacher?"cabTeacher('check')":'openCabinet()'}">← Назад</button>
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
  window.bankSel=null; bank=t.questions; curId=t.id; curBase=t.name; curName=t.name+' · разбор';
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
/* курс учителя: вкладки «Проверка» (первая), «Уроки», «Готовые ДЗ»; в «Проверке» — ждут проверки / все работы */
let teacherTab='check', checkMode='todo', studentsCache=[], filterStudent=null;
async function loadStudents(){
  studentsCache=(await api('students_list')).students; return studentsCache;
}
function tabsHTML(){
  const T=[['check','Проверка'],['lessons','Уроки'],['tests','Готовые ДЗ']];
  return `<div class="tabs">${T.map(([k,l])=>`<button class="tab${teacherTab===k?' on':''}" onclick="cabTeacher('${k}')">${l}</button>`).join('')}</div>`;
}
/* старые имена вкладок: todo/all — это «Проверка» с нужным фильтром */
function checkShow(mode){ checkMode=mode; if(mode==='todo') filterStudent=null; cabTeacher('check'); }
async function cabTeacher(tab){
  if(tab==='todo'||tab==='all'){ checkMode=tab; tab='check'; }
  teacherTab=['check','lessons','tests'].includes(tab)?tab:'check';
  cabShow(`<div class="cab"><h2 class="cab-h">Курс</h2>
    ${tabsHTML()}<div id="tbody" class="cab-load">Загружаем…</div></div>`);
  if(teacherTab==='lessons') return teacherLessons();
  if(teacherTab==='tests'){ const b=$('#tbody'); b.className=''; b.innerHTML=testsListHTML(); return; }
  const todo=checkMode==='todo'&&!filterStudent;
  let studs, data;
  try{
    [studs, data] = await Promise.all([loadStudents(),
      api('subs_list',{ todo, student:filterStudent||undefined }).then(r=>r.subs)]);
  }catch(e){ const b=$('#tbody'); if(b){ b.className=''; b.textContent='Не удалось загрузить: '+e.message; } return; }
  const names=Object.fromEntries(studs.map(p=>[p.login,p.full_name]));
  const box=$('#tbody'); if(!box) return;
  box.className='';
  const head = filterStudent ? `<div class="fbar">Ученик: <b>${esc(names[filterStudent]||'')}</b>
      <button class="linkbtn" onclick="filterStudent=null;checkShow('all')">показать всех</button></div>
      <div id="prog" style="margin-bottom:18px"></div>`
    : `<div class="seg" role="group" aria-label="Какие работы показать">
        <button aria-pressed="${todo}" onclick="checkShow('todo')">Ждут проверки</button>
        <button aria-pressed="${!todo}" onclick="checkShow('all')">Все работы</button></div>`;
  box.innerHTML = head + (data.length ? `<div class="tlist">${data.map(s=>`
      <div class="tcard" onclick="cabSubmission('${s.id}')">
        <div class="tinfo"><div class="tname">${esc(names[s.student]||'Удалённый ученик')}</div>
          <div class="tmeta">${esc(s.test_name)}</div>
          <div class="tmeta">${fmtDate(s.created_at)} · ${statusLine(s)}</div></div>
        ${subBadge(s)}<span class="tgo">→</span>
      </div>`).join('')}</div>`
    : `<div class="empty">${todo?'Непроверенных работ нет':'Работ пока нет'}</div>`);
  if(filterStudent) drawProgress($('#prog'), data);
}
/* личный кабинет учителя: ученики, пароль, выход */
function teacherProfile(){
  cabShow(`<div class="cab"><div class="cab-top"><h2 class="cab-h">Личный кабинет</h2>
    <div class="sact"><button class="linkbtn back" onclick="changePass()">Сменить пароль</button><button class="logout" onclick="doLogout()">Выйти</button></div></div>
    <p class="cab-sub">${esc(me.full_name||'')} · учитель</p>
    <div id="tbody" class="cab-load">Загружаем…</div>
    <button class="btn ghost" style="margin-top:22px" onclick="cabTeacher('check')">Перейти в курс</button></div>`);
  return teacherStudents();
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
          <button class="linkbtn" onclick="filterStudent='${esc(p.login)}';checkShow('all')">Работы</button>
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
  return me.role==='teacher' ? cabTeacher('tests') : lessonsList();
}
/* «Перейти в курс»: учителю курс открывается на вкладке «Проверка» */
function cabGoCourse(){
  if(!CAB) return hwList();
  if(!me) return cabLogin(()=>cabGoCourse());
  return me.role==='teacher' ? cabTeacher('check') : lessonsList();
}
/* левая панель: Проверка (учитель), Уроки, Расписание, Банк заданий, Полезные файлы */
function cabNav(k){
  if(!CAB) return hwList();
  if(!me) return cabLogin(()=>navGo(k));
  const teacher=me.role==='teacher';
  if(k==='check') return teacher ? cabTeacher('check') : lessonsList();
  if(k==='lessons') return teacher ? cabTeacher('lessons') : lessonsList();
  if(k==='schedule') return scheduleView();
  if(k==='bank') return bankView();
  if(k==='files') return filesView();
}
/* план курса «Вайб» (из «Расписание Вайб.pdf»): «ММ-ДД|вид|тема|п», п — в этот день пробник.
   Вид: L — урок, G — практика в минигруппе, C — практика в классе, R — репетиция ЕГЭ. Сентябрь–декабрь — 2026, дальше 2027 */
const COURSE_PLAN=[
  ['1 блок','сентябрь–октябрь',['09-14|L|Всё о ЕГЭ по обществознанию: структура, разбор каждого задания, критерии оценивания, ловушки, инсайды от экспертов и составителей|п',
    '09-16|L|Биосоциальная сущность. Мировоззрение','09-19|G|Вторая часть ЕГЭ','09-21|L|Мышление, деятельность, потребности, интересы','09-23|L|Познание',
    '09-26|G|Отрабатываем теорию','09-28|L|Истина и свобода','09-30|L|Культура, искусство, мораль + духовные ценности российского общества',
    '10-03|C|Раздел «ЧиО»','10-05|L|Образование, наука','10-07|L|Завальные задания прошлых лет. Вторая часть','10-10|G|«Гробы» с реального ЕГЭ']],
  ['2 блок','октябрь–ноябрь',['10-12|L|Строение общества|п','10-14|L|25 задание. Самое дорогое задание ЕГЭ','10-17|G|25 задание',
    '10-19|L|Задание 18 (термины), 24 (сложные планы), 25 (обоснование + примеры РФ)','10-21|L|Религия, типы общества','10-24|G|Задания 18, 24, 25',
    '10-26|L|Прогресс, глобальные проблемы','10-28|L|Обобщение раздела «Человек и общество»','10-31|C|Банк заданий ФИПИ',
    '11-02|L|Экономика и факторы производства','11-04|L|Экономические системы. Рост и развитие','11-07|G|Экономика']],
  ['3 блок','ноябрь–декабрь',['11-09|L|Рынок и конкуренция|п','11-11|L|Спрос и предложение','11-14|G|Вторая часть','11-16|L|Как решать графики на ЕГЭ? Задание 21',
    '11-18|L|Предпринимательство','11-21|G|Задание 21','11-23|L|Новые темы кодификатора ЕГЭ 2027. Экономика','11-25|L|Рациональное поведение в экономике',
    '11-28|C|Решаем вариант','11-30|L|Финансовые институты. Банки','12-02|L|Ценные бумаги','12-05|G|Экономика']],
  ['4 блок','декабрь',['12-07|L|Финансовая грамотность на ЕГЭ|п','12-09|L|Рынок труда. Безработица','12-12|G|Планы','12-14|L|Инфляция',
    '12-16|L|Государство в экономике','12-19|G|Примеры на реалии РФ','12-21|L|Гос. бюджет. Мировая экономика','12-23|L|Налоги. Систематизация экономики',
    '12-26|G|Экономика','12-28|L|Стратификация и мобильность','12-29|L|Нации. Семья','12-30|L|Соц. конфликт, группы, молодёжь']],
  ['5 блок','январь–февраль',['01-09|C|Весь вариант ЕГЭ|п','01-11|L|Соц. контроль, девиации, социализация','01-13|L|Власть, пол. система, государство',
    '01-16|G|Тестовая часть','01-18|L|Форма государства','01-20|L|Новые темы кодификатора 2027 г. в Политике','01-23|G|Задание 23',
    '01-25|L|Задание 23: Политика','01-27|L|Гражданское общество, правовое гос-во, пол. участие, СМИ','01-30|G|Вторая часть',
    '02-01|L|Пол. процесс, элита, лидерство','02-03|L|Завальные задания прошлых лет — Политика']],
  ['6 блок','февраль–март',['02-06|G|Политика|п','02-08|L|Всё о 13 задании','02-10|L|Избирательная кампания, пол. партии','02-13|G|Задание 13',
    '02-15|L|Органы государственной власти. Задание 13','02-17|L|Предметы ведения. Задание 13','02-20|C|Задание 13','02-22|L|Систематизация Политики',
    '02-24|L|Система права','02-27|G|Повторение','03-01|L|Юридическая ответственность','03-03|L|Обучение экспертов. Ловушки оценивания']],
  ['7 блок','март',['03-06|G|Право|п','03-08|L|Гражданское право 1/2. Тематическая практика','03-10|L|Гражданское право 2/2. Тематическая практика',
    '03-13|G|Вторая часть','03-15|L|Практика по Праву. Отработка 25 задания','03-17|L|Организационно-правовые формы предприятия','03-20|C|Тестовая часть',
    '03-22|L|Трудовое право','03-24|L|Самые сложные планы по Праву','03-27|G|Планы','03-29|L|Семейное право',
    '03-31|L|Воинская обязанность, налоговое право, гражданство РФ']],
  ['8 блок','апрель',['04-03|G|Термины|п','04-05|L|Изменения в законодательстве и ЕГЭ 2027 г. Новое в праве','04-07|L|Экологическое право',
    '04-10|C|Задания с реального ЕГЭ','04-12|L|Гражданский процесс','04-14|L|Задания с досрока ЕГЭ','04-17|G|Задания с досрока ЕГЭ',
    '04-19|L|Административное право','04-21|L|Уголовное право','04-24|G|Право','04-26|L|Правоохранительные органы. Судебная система',
    '04-28|L|Конституция — вся теория и практика']],
  ['9 блок','май',['05-01|G|Конституция','05-03|L|23 задание: Экономика, Соц. отношения, Политика (все задания и ответы)',
    '05-05|L|23 задание: Духовная сфера (все задания и ответы)','05-08|C|23 задание','05-10|L|23 задание: Право (все задания и ответы)',
    '05-11|L|Задание 18 — термины и признаки (все блоки)','05-12|L|Отработка всех мер в РФ + всех личностей (для 25-го задания)','05-15|G|25 задание',
    '05-17|L|Решаем «гробовые» задания с ЕГЭ прошлых лет','05-18|L|Весь спецификатор. Все нужные для ЕГЭ указы Президента и др. законы',
    '05-19|L|Задание 24 — Сложные планы','05-22|R|Репетиция ЕГЭ-2027 — полноценная процедура экзамена|п']],
];
const PLAN_KIND={ L:'Урок', G:'Практика в минигруппе', C:'Практика в классе', R:'Репетиция ЕГЭ' };
function coursePlan(){
  return COURSE_PLAN.map(([name,months,items])=>({ name, months, items:items.map(s=>{
    const [md,k,title,p]=s.split('|'), [m,d]=md.split('-').map(Number);
    return { t:+new Date(m>=9?2026:2027, m-1, d), k, title, probe:!!p };
  }) }));
}
let schTab='plan';
function scheduleView(tab){
  if(tab) schTab=tab;
  cabShow(`<div class="cab"><h2 class="cab-h">Расписание</h2><p class="cab-sub">Курс «Вайб» · сентябрь–май</p>
    <div class="seg" role="group" aria-label="Что показать">
      <button aria-pressed="${schTab==='plan'}" onclick="scheduleView('plan')">План курса</button>
      <button aria-pressed="${schTab==='hw'}" onclick="scheduleView('hw')">Уроки и ДЗ</button></div>
    <div id="sch" class="cab-load">Загружаем…</div></div>`);
  return schTab==='plan' ? planView() : lessonsSchedule();
}
/* план курса: списком по блокам или календарём по месяцам (planCal) */
let planCal=false, calMonth=null, calDay=null;
function planToday(){ const d=new Date(); d.setHours(0,0,0,0); return +d; }
function planFmt(t,o){ return new Date(t).toLocaleDateString('ru-RU',o); }
function planTags(e){ return `<span class="cp-k ${e.k}">${PLAN_KIND[e.k]}</span>${e.probe?'<span class="cp-probe">Пробник</span>':''}`; }
function planRow(e){
  const today=planToday(), past=e.t<today, now=e.t===today;
  return `<div class="cp-ev${past?' past':''}${now?' now':''}">
    <div class="cp-d"><b>${planFmt(e.t,{day:'numeric'})}</b><span>${planFmt(e.t,{month:'short'}).replace('.','')} · ${planFmt(e.t,{weekday:'short'})}</span></div>
    <div class="cp-b"><div class="cp-tags">${planTags(e)}</div><div class="cp-t">${esc(e.title)}</div></div>
    ${past?'<span class="cp-done">✓ прошло</span>':now?'<span class="cp-today">сегодня</span>':''}</div>`;
}
function planToggle(cal){ planCal=cal; calDay=null; planView(); }
function planView(){
  const box=$('#sch'); if(!box) return; box.className='';
  if(planCal) return calView(box);
  const today=planToday();
  const blocks=coursePlan(), all=blocks.flatMap(b=>b.items), next=all.find(e=>e.t>=today);
  const when=t=>{ const d=Math.round((t-today)/DAY); return d===0?'Сегодня':d===1?'Завтра':'Через '+d+' '+(d%10===1&&d%100!==11?'день':(d%10>=2&&d%10<=4&&(d%100<10||d%100>=20)?'дня':'дней')); };
  const cur=next?blocks.find(b=>b.items.includes(next)):null;
  box.innerHTML=`<button class="btn ghost cp-switch" onclick="planToggle(true)">Открыть как календарь</button>`
    +(next?`<div class="cp-next">
      <div class="cp-next-h">Следующее занятие · ${when(next.t)}</div>
      <div class="cp-next-d">${planFmt(next.t,{weekday:'long',day:'numeric',month:'long'})}</div>
      <div class="cp-tags">${planTags(next)}</div><div class="cp-next-t">${esc(next.title)}</div></div>`
    :`<div class="empty">Курс завершён. Удачи на экзамене.</div>`)
    + blocks.map(b=>{ const done=b.items.every(e=>e.t<today);
      return `<details class="sect cp-block"${b===cur?' open':''}>
        <summary><span class="st">${b.name}</span><span class="cp-m">${b.months}</span>${done?'<span class="cp-bdone">✓ пройден</span>':''}<span class="sc">${b.items.length}</span><span class="sa">›</span></summary>
        <div class="cp-list">${b.items.map(planRow).join('')}</div>
        ${b===blocks[blocks.length-1]?'<div class="cp-final">Неделя перед ЕГЭ — финальный интенсив-повторение</div>':''}
      </details>`; }).join('');
}
/* календарь: сетка месяца пн–вс, занятия на днях; по клику на день — его занятия под сеткой */
function calView(box){
  const all=coursePlan().flatMap(b=>b.items), today=planToday();
  const months=[...new Set(all.map(e=>{ const d=new Date(e.t); return d.getFullYear()*12+d.getMonth(); }))];
  if(calMonth==null||months.indexOf(calMonth)<0){
    const nd=new Date((all.find(e=>e.t>=today)||all[all.length-1]).t); calMonth=nd.getFullYear()*12+nd.getMonth();
  }
  const y=Math.floor(calMonth/12), m=calMonth%12, mi=months.indexOf(calMonth);
  const byDay={}; all.forEach(e=>{ (byDay[e.t]=byDay[e.t]||[]).push(e); });
  const first=new Date(y,m,1), lead=(first.getDay()+6)%7, days=new Date(y,m+1,0).getDate();
  const cells=[]; for(let k=0;k<lead;k++) cells.push('<div class="cal-c cal-empty"></div>');
  for(let d=1;d<=days;d++){
    const t=+new Date(y,m,d), ev=byDay[t]||[], past=t<today;
    const cls=['cal-c']; if(ev.length) cls.push('has'); if(t===today) cls.push('today'); if(past) cls.push('past'); if(t===calDay) cls.push('sel');
    const label=planFmt(t,{day:'numeric',month:'long'})+(ev.length?': '+ev.map(e=>PLAN_KIND[e.k]+' — '+e.title).join('; '):'');
    cells.push(ev.length
      ? `<button class="${cls.join(' ')}" aria-label="${esc(label)}" aria-pressed="${t===calDay}" onclick="calPick(${t})"><span class="cal-n">${d}</span>
          ${ev.map(e=>`<span class="cal-e ${e.k}"><span class="cal-s" aria-hidden="true">${CAL_KIND[e.k][0]}</span><span class="cal-k">${CAL_KIND[e.k]}</span>${e.probe?'<span class="cal-p">пробник</span>':''}<span class="cal-t">${esc(e.title)}</span></span>`).join('')}</button>`
      : `<div class="${cls.join(' ')}"><span class="cal-n">${d}</span></div>`);
  }
  const sel=calDay&&byDay[calDay];
  const monthName=first.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(' г.','');
  box.innerHTML=`<button class="btn ghost cp-switch" onclick="planToggle(false)">Показать списком</button>
    <div class="cal">
      <div class="cal-h">
        <button class="cal-nav" onclick="calGo(-1)" aria-label="Предыдущий месяц"${mi<=0?' disabled':''}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="cal-m">${monthName}</div>
        <button class="cal-nav" onclick="calGo(1)" aria-label="Следующий месяц"${mi>=months.length-1?' disabled':''}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="cal-w">${['пн','вт','ср','чт','пт','сб','вс'].map(w=>`<span>${w}</span>`).join('')}</div>
      <div class="cal-g">${cells.join('')}</div>
      <div class="cal-leg">${['L','G','R'].map(k=>`<span class="cal-e ${k}"><span class="cal-k"><b class="cal-lk">${CAL_KIND[k][0]} — </b>${CAL_KIND[k]}</span></span>`).join('')}</div>
    </div>
    ${sel?`<div class="cp-list cal-sel">${sel.map(planRow).join('')}</div>`:`<p class="cal-hint">Нажми на день, чтобы увидеть занятие.</p>`}`;
}
const CAL_KIND={ L:'Урок', G:'Практика', C:'Практика', R:'Репетиция' };
function calGo(d){ calMonth+=d; calDay=null; planView(); }
function calPick(t){ calDay=calDay===t?null:t; planView(); }
/* уроки и сроки ДЗ по дням; сначала сегодня и дальше, ниже — прошедшее */
async function lessonsSchedule(){
  let lessons; try{ lessons=(await api('lessons_list')).lessons; }catch(e){ const b=$('#sch'); if(b) b.textContent='Не удалось загрузить: '+e.message; return; }
  const box=$('#sch'); if(!box) return; box.className='';
  const ev=[];
  lessons.forEach(l=>{
    ev.push({ t:+new Date(l.created_at), l, kind:'урок' });
    if(l.deadline&&l.test_name) ev.push({ t:+new Date(l.deadline), l, kind:'dz' });
  });
  const day=x=>{ const d=new Date(x); d.setHours(0,0,0,0); return +d; }, today=day(Date.now());
  const up=ev.filter(e=>day(e.t)>=today).sort((a,b)=>a.t-b.t), past=ev.filter(e=>day(e.t)<today).sort((a,b)=>b.t-a.t);
  const dayLabel=t=>{ const d=Math.round((day(t)-today)/DAY), s=new Date(t).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    return d===0?'Сегодня · '+s:d===1?'Завтра · '+s:s; };
  const row=e=>{ const done=e.kind==='dz'&&lessonDone(e.l);
    return `<div class="sch-ev" onclick="lessonView('${esc(e.l.id)}')"><div style="flex:1;min-width:0"><b>${esc(e.l.title)}</b>
      <span>${e.kind==='dz'?'Сдать ДЗ до '+new Date(e.t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Новый урок'}${e.l.test_name&&e.kind!=='dz'?' · ДЗ: '+esc(e.l.test_name):''}</span></div>
      <span class="sch-k${e.kind==='dz'?(done?' ok':' dz'):''}">${e.kind==='dz'?(done?'✓ сдано':'дедлайн'):'урок'}</span></div>`; };
  const group=list=>{ let out='', cur=null;
    list.forEach(e=>{ const d=day(e.t); if(d!==cur){ cur=d; out+=`<div class="sch-day${d===today?' today':''}">${dayLabel(e.t)}</div>`; } out+=row(e); });
    return out; };
  box.innerHTML = (up.length?group(up):`<div class="empty">Впереди ничего не запланировано</div>`)
    + (past.length?`<details class="qfold" style="margin-top:22px"><summary>Прошедшее · ${past.length}</summary>${group(past)}</details>`:'');
}
/* банк заданий части 1 (bank.json, собирается tools/xlsx_to_bank.py): фильтры по блоку, теме и номеру,
   подборка решается как обычный тест, но учителю не отправляется и ответы открыты сразу */
let bankData=null, bankF={ block:'', topic:'', n:'' };
try{ Object.assign(bankF, JSON.parse(localStorage.getItem('tr_bankf')||'{}')); }catch(e){}
async function bankView(){
  cabShow(`<div class="cab"><h2 class="cab-h">Банк заданий</h2><p class="cab-sub">Часть 1 · задания с ответами и пояснениями</p>
    <div id="bnk" class="cab-load">Загружаем…</div></div>`);
  if(!bankData){
    try{ const r=await fetch('bank.json'); if(!r.ok) throw 0; bankData=await r.json(); }
    catch(e){ const b=$('#bnk'); if(b) b.textContent='Не удалось загрузить банк заданий. Проверь интернет.'; return; }
    bankData.topicName=Object.fromEntries(bankData.topics.map(t=>[t.code,t.name]));
  }
  bankDraw();
}
function bankMatch(q,skip){
  return (skip==='block'||!bankF.block||q.block===bankF.block)
    && (skip==='topic'||!bankF.topic||q.topic===bankF.topic)
    && (skip==='n'||!bankF.n||q.n===bankF.n);
}
function bankList(){ return bankData.questions.filter(q=>bankMatch(q)); }
function bankCount(key){   // сколько заданий даст каждое значение фильтра при остальных выбранных
  const c={}; bankData.questions.forEach(q=>{ if(bankMatch(q,key)) c[q[key]]=(c[q[key]]||0)+1; }); return c;
}
function bankLabel(){
  const p=[]; if(bankF.n) p.push('Задание '+bankF.n);
  if(bankF.topic) p.push(bankF.topic+' '+bankData.topicName[bankF.topic]); else if(bankF.block) p.push(bankF.block);
  return p.join(' · ')||'Все задания';
}
function bankDraw(){
  const box=$('#bnk'); if(!box||!bankData) return; box.className='';
  const D=bankData, cb=bankCount('block'), ct=bankCount('topic'), cn=bankCount('n'), n=bankList().length;
  const topics=D.blocks.filter(b=>!bankF.block||b===bankF.block).flatMap(b=>[
    ...(bankF.block?[]:[{ group:b }]),
    ...D.topics.filter(t=>t.block===b).map(t=>({ v:t.code, code:t.code, label:t.name, c:ct[t.code]||0 }))]);
  const nums=[...new Set(D.questions.map(q=>q.n))].sort((a,b)=>a-b);
  const any=bankF.block||bankF.topic||bankF.n;
  box.innerHTML=`
    <div class="bank-f">
      ${ddHTML('bf-block','Блок','Все блоки',bankF.block,D.blocks.map(b=>({ v:b, label:b, c:cb[b]||0 })))}
      ${ddHTML('bf-topic','Тема','Все темы',bankF.topic,topics)}
      ${ddHTML('bf-n','Номер задания','Все номера',bankF.n,nums.map(v=>({ v, label:'Задание '+v, c:cn[v]||0 })))}
    </div>
    <div class="bank-sum"><span>Найдено: <b>${plural(n)}</b></span>
      ${any?`<button class="linkbtn" onclick="bankReset()">Сбросить фильтры</button>`:''}</div>
    ${n?`<button class="btn" onclick="bankRun()">Решать подборку</button>`:`<div class="empty">По этим фильтрам заданий нет.</div>`}`;
}
/* выпадающий список в стиле сайта вместо системного select: кнопка + listbox, клавиши ↑ ↓ Enter Esc.
   id вида «bf-<ключ фильтра>»; пункт с c===0 недоступен, { group } — подзаголовок */
function ddHTML(id,label,ph,cur,items){
  const sel=items.find(i=>i.v===cur);
  const opts=[{ v:'', label:ph }, ...items].map((it,k)=>it.group!=null
    ? `<div class="dd-g" role="presentation">${esc(it.group)}</div>`
    : `<div class="dd-o" role="option" id="${id}-o${k}" data-v="${esc(it.v)}" aria-selected="${it.v===cur}"${it.c===0?' aria-disabled="true"':''}
        onclick="ddPick('${id}',this)" title="${esc((it.code?it.code+' ':'')+it.label)}"><span class="dd-l">${it.code?`<b class="dd-code">${esc(it.code)}</b> `:''}${esc(it.label)}</span>${it.c?`<span class="dd-c">${it.c}</span>`:''}</div>`).join('');
  return `<div class="dd" id="${id}"><span class="lab" id="${id}-l">${label}</span>
    <button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}-l ${id}-v"
      onclick="ddToggle('${id}')" onkeydown="ddKey(event,'${id}')"><span class="dd-v" id="${id}-v">${esc(sel?(sel.code?sel.code+' ':'')+sel.label:ph)}</span><span class="dd-ch" aria-hidden="true">›</span></button>
    <div class="dd-pop" role="listbox" aria-labelledby="${id}-l" hidden>${opts}</div></div>`;
}
function ddEls(id){ const r=document.getElementById(id); return r&&{ btn:r.querySelector('.dd-btn'), pop:r.querySelector('.dd-pop') }; }
function ddOpts(pop){ return [...pop.querySelectorAll('.dd-o:not([aria-disabled])')]; }
function ddActive(id,o){
  const e=ddEls(id); e.pop.querySelectorAll('.dd-o.act').forEach(x=>x.classList.remove('act'));
  if(!o) return; o.classList.add('act'); e.btn.setAttribute('aria-activedescendant',o.id); o.scrollIntoView({ block:'nearest' });
}
function ddClose(id){
  const e=ddEls(id); if(!e||e.pop.hidden) return;
  e.pop.hidden=true; e.btn.setAttribute('aria-expanded','false'); e.btn.removeAttribute('aria-activedescendant');
}
function ddToggle(id){
  const e=ddEls(id); if(!e) return;
  if(!e.pop.hidden) return ddClose(id);
  document.querySelectorAll('.dd').forEach(d=>d.id!==id&&ddClose(d.id));
  e.pop.hidden=false; e.btn.setAttribute('aria-expanded','true');
  ddActive(id, e.pop.querySelector('.dd-o[aria-selected="true"]')||ddOpts(e.pop)[0]);
}
function ddPick(id,o){
  if(o.getAttribute('aria-disabled')) return;
  ddClose(id); bankSet(id.slice(3),o.dataset.v);
  const e=ddEls(id); if(e) e.btn.focus();
}
function ddKey(ev,id){
  const e=ddEls(id), open=!e.pop.hidden, list=ddOpts(e.pop), i=list.indexOf(e.pop.querySelector('.dd-o.act'));
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
    ev.preventDefault(); if(!open) return ddToggle(id);
    ddActive(id, list[Math.max(0,Math.min(list.length-1,i+(ev.key==='ArrowDown'?1:-1)))]);
  }else if((ev.key==='Enter'||ev.key===' ')&&open){ ev.preventDefault(); if(list[i]) ddPick(id,list[i]); }
  else if(ev.key==='Escape'&&open){ ev.preventDefault(); ddClose(id); }
  else if(ev.key==='Tab') ddClose(id);
}
document.addEventListener('click',ev=>{ document.querySelectorAll('.dd').forEach(d=>{ if(!d.contains(ev.target)) ddClose(d.id); }); });
function bankSet(k,v){
  bankF[k]=v;
  if(k==='block'&&bankF.topic&&!(v&&bankData.topics.some(t=>t.code===bankF.topic&&t.block===v))) bankF.topic='';
  if(k==='topic'&&v) bankF.block=bankData.topics.find(t=>t.code===v).block;
  try{ localStorage.setItem('tr_bankf',JSON.stringify(bankF)); }catch(e){}
  bankDraw();
}
function bankReset(){ bankF={ block:'', topic:'', n:'' }; bankSet('n',''); }
/* подборка решается движком тестов; window.bankSel отличает её от ДЗ (ответы открыты, «К банку заданий») */
function bankRun(){
  const list=bankList(); if(!list.length) return;
  window.bankSel=list; bank=list.slice(); curId=''; curName=curBase='Банк · '+bankLabel();
  review=null; idx=0; score=0; results=[]; render(); window.scrollTo({top:0});
}
/* полезные файлы: материалы всех уроков в одном месте */
async function filesView(){
  cabShow(`<div class="cab"><h2 class="cab-h">Полезные файлы</h2><p class="cab-sub">Материалы из всех уроков</p><div id="fls" class="cab-load">Загружаем…</div></div>`);
  let groups;
  try{
    const lessons=(await api('lessons_list')).lessons.filter(l=>l.files_n);
    groups=await Promise.all(lessons.map(l=>api('lesson_get',{ id:l.id }).then(r=>r.lesson)));
  }catch(e){ const b=$('#fls'); if(b) b.textContent='Не удалось загрузить: '+e.message; return; }
  const box=$('#fls'); if(!box) return; box.className='';
  box.innerHTML = groups.filter(l=>l.files.length).map(l=>`<div class="files-h">${esc(l.title)}</div><div class="flist">${fileLinksHTML(l.files)}</div>`).join('')
    || `<div class="empty">Файлов пока нет.<br>Когда учитель прикрепит материалы к уроку, они появятся здесь.</div>`;
}
/* название в шапке: к урокам курса; гостю — входная страница */
function cabGoLessons(){
  if(!CAB) return hwList();
  if(!me) return home();
  return me.role==='teacher' ? cabTeacher('lessons') : lessonsList();
}
/* список ДЗ у учителя с сервером живёт во вкладке «Готовые ДЗ» */
function cabTeacherTests(){ if(CAB&&me&&me.role==='teacher'){ cabTeacher('tests'); return true; } return false; }
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
  if(h==='kinescope.io' && (m=u.pathname.match(/^\/(?:embed\/|watch\/)?([A-Za-z0-9]{8,40})\/?$/)))
    return 'https://kinescope.io/embed/'+m[1];
  if((h==='vk.com'||h==='vkvideo.ru'||h==='vk.ru') && (m=(u.pathname+u.search).match(/video(-?\d+)_(\d+)/)))
    return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`;
  return null;
}
const videoFrame = src => `<div class="vwrap"><iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock; gyroscope; accelerometer; clipboard-write" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

let curLesson=null;
async function lessonsList(){
  cabShow(`<div class="cab">
    <h2 class="cab-h" style="margin:0 0 18px">Уроки</h2>
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
  box.innerHTML += `<div class="dl-box">${deadlinesHTML(lessons)}</div>`;
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
      <button class="btn" onclick="openTest('${esc(t.id)}')">${done?'Решать тест ещё раз':'Решать ДЗ'}</button>
      ${done&&t.questions.some(isP2)?'<div class="resnote">Вторая часть уже отправлена учителю — заново решается только тест.</div>':''}</div>`:''}
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
  box.innerHTML=`<button class="btn" style="margin-bottom:18px" onclick="lessonEdit(null)">Создать урок</button>
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
    <label class="lab" for="lv">Видео или трансляция — ссылка Kinescope, Rutube, VK Видео или YouTube</label>
    <input id="lv" class="tin" value="${esc(editL.video)}" placeholder="https://kinescope.io/…" oninput="lessonVideoPreview()">
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
