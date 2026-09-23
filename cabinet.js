/* ===== Кабинеты: вход, отправка работ, проверка части 2 ===== */
/* Сервер — функция в Yandex Cloud (папка backend/). Адрес функции: */
const API_URL = window.TRENER_API || '';

const CAB = !!API_URL;
let me = null;              // {login, full_name, role, avatar}
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
  paintAcct();
  toast('Привет, '+firstName(me.full_name)+'!');
  const f=afterLogin; afterLogin=null;
  f ? f() : openCabinet();
}
function doLogout(){ setToken(''); me=null; paintAcct(); home(); }

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
  if(!me){ box.innerHTML=`<div class="land-note">Чтобы отправлять ДЗ на проверку, <button class="linkbtn" onclick="cabLogin()">войди</button> по логину от учителя.</div>`; return; }
  if(me.role==='teacher'){
    let count=0; try{ count=(await api('todo_count')).count; }catch(e){}
    box.innerHTML=`<div class="land-card" onclick="cabTeacher('todo')"><div><b>${count||0}</b></div><span>работ ждут проверки →</span></div>`;
    return;
  }
  let data=[]; try{ data=(await api('my_subs')).subs; }catch(e){}
  if(!document.getElementById('landextra')) return;
  const pts=progressPoints(data||[]);
  if(!pts.length){ box.innerHTML=''; return; }
  const avg=Math.round(pts.reduce((a,p)=>a+p.pct,0)/pts.length);
  box.innerHTML=`<div class="land-card" onclick="cabStudent()"><div><b>${avg}%</b></div>
    <span>средний результат за ${pts.length} ${pts.length%10===1&&pts.length%100!==11?'проверенную работу':'проверенных работ'}. Посмотреть прогресс →</span></div>`;
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
  sentFor=results; renderSendBox(); toast('Работа отправлена');
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
        <div class="uans-lab">Общий комментарий</div>
        <textarea class="essay cm" id="gcm" placeholder="Необязательно">${esc(s.comment||'')}</textarea>
        <button class="btn" id="gsave" style="margin-top:16px" onclick="saveGrade()">${s.checked_at?'Сохранить изменения':'Сохранить проверку'}</button>`
      : (!teacher&&s.comment?`<div class="uans-lab">Общий комментарий учителя</div><div class="uans tc">${esc(s.comment)}</div>`:'')}
    </div>`);
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
  if(missing && !confirm(`Не выставлены баллы у ${missing} зад. Считать их за 0?`)) return;
  const btn=$('#gsave'); busy(btn,true,'Сохраняем…');
  try{ await api('grade',{ id:s.id, grades, comment:$('#gcm').value.trim()||null }); }
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
  const T=[['todo','На проверке'],['all','Все работы'],['students','Ученики']];
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

/* ---------- старт ---------- */
if(CAB){
  if(location.hash==='#setup') cabSetup();
  loadMe().then(()=>{ if(document.getElementById('landextra')) landExtra(); });
}
paintAcct();
