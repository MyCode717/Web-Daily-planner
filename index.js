const DAY_MS = 86400000;

function fmtKey(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0');
}
function fmtLabel(d){
  return d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function fmtShort(d){
  return d.toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short'});
}
function todayDate(){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function uid(){ return Math.random().toString(36).slice(2,10); }

let selectedDate = todayDate();
let dayCache = {}; // key -> {priorities:[], todos:[], tomorrow:'', notes:''}
let calendarId = '';

async function storageGet(key){
  try{
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  }catch(e){ return null; }
}
async function storageSet(key, value){
  try{ await window.storage.set(key, JSON.stringify(value)); }catch(e){ console.error('storage set failed', e); }
}

function emptyDay(){
  return { priorities: [], todos: [], tomorrow: '', notes: '' };
}

async function loadDay(key){
  if(dayCache[key]) return dayCache[key];
  const data = await storageGet('day:'+key) || emptyDay();
  dayCache[key] = data;
  return data;
}
async function saveDay(key){
  await storageSet('day:'+key, dayCache[key]);
}

async function runCarryover(){
  const todayKey = fmtKey(todayDate());
  const meta = await storageGet('meta') || {};
  if(meta.lastDate === todayKey) return; // already processed today

  if(meta.lastDate){
    const prevData = await loadDay(meta.lastDate);
    const todayData = await loadDay(todayKey);

    const carryPriorities = prevData.priorities.filter(t=>!t.done).map(t=>({...t, carried:true}));
    const carryTodos = prevData.todos.filter(t=>!t.done).map(t=>({...t, carried:true}));

    // avoid duplicate carry if this ever runs twice
    const existingPIds = new Set(todayData.priorities.map(t=>t.id));
    const existingTIds = new Set(todayData.todos.map(t=>t.id));

    carryPriorities.forEach(t=>{ if(!existingPIds.has(t.id)) todayData.priorities.push(t); });
    carryTodos.forEach(t=>{ if(!existingTIds.has(t.id)) todayData.todos.push(t); });

    await saveDay(todayKey);
  }
  meta.lastDate = todayKey;
  await storageSet('meta', meta);
}

function taskRow(task, kind){
  const li = document.createElement('li');
  li.className = 'task-row' + (task.done ? ' done' : '');
  const chk = document.createElement('div');
  chk.className = 'chk' + (task.done ? ' done' : '');
  chk.onclick = () => toggleTask(kind, task.id);
  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.textContent = task.text;
  li.appendChild(chk);
  li.appendChild(txt);
  if(task.carried){
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'dari kemarin';
    li.appendChild(tag);
  }
  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '×';
  del.onclick = () => deleteTask(kind, task.id);
  li.appendChild(del);
  return li;
}

async function render(){
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);

  document.getElementById('headerDate').textContent = fmtLabel(todayDate());
  document.getElementById('calDateLabel').textContent = fmtShort(selectedDate);

  const pList = document.getElementById('prioritiesList');
  pList.innerHTML = '';
  if(data.priorities.length === 0){
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Belum ada prioritas untuk hari ini.';
    pList.appendChild(hint);
  } else {
    data.priorities.forEach(t => pList.appendChild(taskRow(t,'priorities')));
  }

  const tList = document.getElementById('todosList');
  tList.innerHTML = '';
  if(data.todos.length === 0){
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Belum ada tugas. Tambahkan di bawah.';
    tList.appendChild(hint);
  } else {
    data.todos.forEach(t => tList.appendChild(taskRow(t,'todos')));
  }

  document.getElementById('tomorrowNote').value = data.tomorrow || '';
  document.getElementById('notesText').value = data.notes || '';

  renderCalendarFrame();
}

async function toggleTask(kind, id){
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);
  const t = data[kind].find(x=>x.id===id);
  if(t){ t.done = !t.done; await saveDay(key); render(); }
}
async function deleteTask(kind, id){
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);
  data[kind] = data[kind].filter(x=>x.id!==id);
  await saveDay(key); render();
}
async function addTask(kind, text){
  text = text.trim();
  if(!text) return;
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);
  data[kind].push({ id: uid(), text, done:false });
  await saveDay(key); render();
}

function renderCalendarFrame(){
  const area = document.getElementById('calFrameArea');
  area.innerHTML = '';
  if(!calendarId){
    const ph = document.createElement('div');
    ph.className = 'cal-placeholder';
    ph.textContent = 'Masukkan Calendar ID di atas untuk menampilkan jadwal Google Calendar-mu di sini.';
    area.appendChild(ph);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'cal-frame-wrap';
  const iframe = document.createElement('iframe');
  const src = 'https://calendar.google.com/calendar/embed?src=' +
    encodeURIComponent(calendarId) +
    '&mode=AGENDA&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&showNav=1&showDate=1&ctz=Asia%2FJakarta';
  iframe.src = src;
  wrap.appendChild(iframe);
  area.appendChild(wrap);
  const hint = document.createElement('div');
  hint.className = 'save-hint';
  hint.style.padding = '8px 12px 0';
  hint.textContent = 'Gunakan tombol navigasi di dalam kalender untuk melihat jadwal hari sebelum/sesudahnya.';
  area.appendChild(hint);
}

function debounce(fn, ms){
  let t;
  return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

const saveTomorrow = debounce(async (val)=>{
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);
  data.tomorrow = val;
  await saveDay(key);
  const hint = document.getElementById('tomorrowSaveHint');
  hint.textContent = 'Tersimpan';
  setTimeout(()=>hint.textContent='', 1200);
}, 500);

const saveNotes = debounce(async (val)=>{
  const key = fmtKey(selectedDate);
  const data = await loadDay(key);
  data.notes = val;
  await saveDay(key);
  const hint = document.getElementById('notesSaveHint');
  hint.textContent = 'Tersimpan';
  setTimeout(()=>hint.textContent='', 1200);
}, 500);

function bindEvents(){
  document.getElementById('priorityAdd').onclick = () => {
    const inp = document.getElementById('priorityInput');
    addTask('priorities', inp.value); inp.value='';
  };
  document.getElementById('priorityInput').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('priorityAdd').click();
  });
  document.getElementById('todoAdd').onclick = () => {
    const inp = document.getElementById('todoInput');
    addTask('todos', inp.value); inp.value='';
  };
  document.getElementById('todoInput').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('todoAdd').click();
  });

  document.getElementById('prevDay').onclick = () => {
    selectedDate = new Date(selectedDate.getTime() - DAY_MS);
    render();
  };
  document.getElementById('nextDay').onclick = () => {
    selectedDate = new Date(selectedDate.getTime() + DAY_MS);
    render();
  };
  document.getElementById('jumpToday').onclick = () => {
    selectedDate = todayDate();
    render();
  };

  document.getElementById('tomorrowNote').addEventListener('input', e=> saveTomorrow(e.target.value));
  document.getElementById('notesText').addEventListener('input', e=> saveNotes(e.target.value));

  const calInput = document.getElementById('calendarIdInput');
  calInput.addEventListener('change', async e=>{
    calendarId = e.target.value.trim();
    await storageSet('settings', { calendarId });
    renderCalendarFrame();
  });
}

async function init(){
  bindEvents();
  await runCarryover();
  const settings = await storageGet('settings');
  if(settings && settings.calendarId){
    calendarId = settings.calendarId;
    document.getElementById('calendarIdInput').value = calendarId;
  }
  render();
}
init();