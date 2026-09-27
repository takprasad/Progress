const STORAGE_KEY = 'progress_state_v1';
const LEGACY_STORAGE_KEY = 'dayflow_state_v1';
const CONFIG_KEY = 'progress_config_v1';
const LEGACY_CONFIG_KEY = 'dayflow_config_v1';

const defaultState = {
  tasks: [],
  goals: [],
  habits: [],
  habitLogs: {},
  ideas: [],
  inbox: [],
  reviews: {},
  settings: { wake: '07:00', sleep: '23:00', bufferPercent: 20 }
};

const navTitles = {
  today: 'Today', planner: 'Planner', tasks: 'Tasks', goals: 'Goals',
  habits: 'Habits', ideas: 'Ideas', review: 'Daily Review', calendar: 'History', settings: 'Settings'
};

let state = loadState();
let config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{"apiUrl":""}');
let currentView = 'today';

const $ = (sel) => document.querySelector(sel);
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const fmtShortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {day:'2-digit', month:'short'});
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
const priorityWeight = p => ({high:3, medium:2, low:1}[p] || 1);
const goalWeight = p => ({weekly:3, monthly:2, yearly:1}[p] || 1);

function loadState(){
  try { return {...structuredClone(defaultState), ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {})}; }
  catch { return structuredClone(defaultState); }
}
function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function save(){ saveLocal(); }
function showToast(msg){
  const el = document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2200);
}

function getTasksForDate(date){ return state.tasks.filter(t=>t.date===date); }
function getGoal(id){ return state.goals.find(g=>g.id===id); }
function getHabit(id){ return state.habits.find(h=>h.id===id); }
function isHabitDone(id,date){ return !!state.habitLogs[`${id}_${date}`]; }
function taskPoints(task){
  let pts = priorityWeight(task.priority) * 5;
  if(task.goalPeriod) pts += goalWeight(task.goalPeriod) * 2;
  if(task.goalId) pts += 2;
  return pts;
}
function dailyTaskScore(date){
  const tasks = getTasksForDate(date).filter(t=>t.status!=='cancelled');
  if(!tasks.length) return {earned:0, possible:0, score:0};
  const possible = tasks.reduce((s,t)=>s+taskPoints(t),0);
  const earned = tasks.reduce((s,t)=>s+taskPoints(t)*(t.completed?1:((t.progress||0)/100)),0);
  return {earned, possible, score: Math.round((earned/possible)*100)};
}
function habitScore(date){
  const active = state.habits.filter(h=>h.active!==false);
  if(!active.length) return 0;
  return Math.round(active.reduce((s,h)=>s+(isHabitDone(h.id,date)?1:0),0)/active.length*100);
}
function goalProgress(goal){
  if(goal.mode==='time'){
    return clamp(Number(goal.current||0),0,Number(goal.target)||1);
  }
  if(goal.mode==='count' && goal.autoCount){
    const count = state.tasks.filter(t=>t.goalId===goal.id && t.completed).reduce((s,t)=>s+(Number(t.contribution)||0),0);
    return clamp(count,0,Number(goal.target)||1);
  }
  return clamp(Number(goal.current||0),0,Number(goal.target)||1);
}
function goalPercent(goal){ return Math.round(goalProgress(goal)/Math.max(Number(goal.target)||1,1)*100); }
function daysRemaining(goal){
  const end = new Date(`${goal.endDate}T23:59:59`); const now = new Date();
  return Math.max(0, Math.ceil((end-now)/86400000));
}
function dateRangeProgress(goal){
  const start = new Date(`${goal.startDate}T00:00:00`), end = new Date(`${goal.endDate}T23:59:59`), now = new Date();
  const total = Math.max(1, end-start), elapsed = clamp(now-start,0,total); return elapsed/total;
}
function goalPaceStatus(goal){
  const actual=goalPercent(goal); const expected=Math.round(dateRangeProgress(goal)*100);
  if(actual>=expected) return {label:'On pace',cls:'low'};
  if(actual>=expected-15) return {label:'Watch pace',cls:'medium'};
  return {label:'Behind',cls:'high'};
}
function availableSlots(date){
  const [wakeH,wakeM]=state.settings.wake.split(':').map(Number); const [sleepH,sleepM]=state.settings.sleep.split(':').map(Number);
  let start=wakeH*60+wakeM, end=sleepH*60+sleepM; if(end<=start) end+=1440;
  const slots=[]; const existing=getTasksForDate(date).filter(t=>t.startTime && t.durationMin>0);
  const busy = existing.map(t=>{const [h,m]=t.startTime.split(':').map(Number);let s=h*60+m; if(s<start)s+=1440; return [s,s+Number(t.durationMin)];});
  for(let t=start;t<end;t+=60){
    const overlap=busy.some(([s,e])=>t<e && t+60>s); if(!overlap) slots.push(t%(1440));
  }
  const keep=Math.ceil(slots.length*(1-(Number(state.settings.bufferPercent)||20)/100));
  return slots.slice(0,Math.max(0,keep));
}
function minToTime(min){ const h=Math.floor(min/60)%24, m=min%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

function goalPlanningMinutes(g){
  const explicit=Number(g.planningMinutes||0);
  if(explicit>0) return explicit;
  if(g.mode==='time' && String(g.unit||'').toLowerCase().includes('hour')) return Number(g.target||0)*60;
  return 0;
}
function activeGoalCandidates(date){
  return state.goals.filter(g=>g.active!==false && g.endDate>=date && goalPercent(g)<100 && goalPlanningMinutes(g)>0)
    .sort((a,b)=>goalWeight(b.period)-goalWeight(a.period) || daysRemaining(a)-daysRemaining(b));
}
function autoPlanToday({silent=false}={}){
  const date=todayISO();
  const added=[]; const candidates=activeGoalCandidates(date);
  if(!candidates.length){ if(!silent)showToast('No measurable goal planning time is configured. Add it in Goals.'); return []; }
  const slotCountByGoal={};
  for(const slot of slots){
    let chosen=null;
    for(const g of candidates){
      const remainingMinutes=Math.max(0, goalPlanningMinutes(g) * (1 - goalProgress(g)/Math.max(Number(g.target)||1,1)));
      const days=Math.max(1,daysRemaining(g)+1);
      let neededToday=remainingMinutes/days;
      if(g.period==='weekly') neededToday*=1.15;
      if(g.period==='yearly') neededToday*=0.9;
      const allocated=(slotCountByGoal[g.id]||0)*60;
      if(neededToday>allocated){ chosen=g; break; }
    }
    if(!chosen) break;
    const dur=60;
    const task={
      id:uid('task'), date, startTime:minToTime(slot), durationMin:dur,
      title:`Work on ${chosen.title}`, priority:chosen.period==='weekly'?'high':chosen.period==='monthly'?'medium':'low',
      category:'Goal', status:'open', completed:false, progress:0, goalId:chosen.id, goalPeriod:chosen.period,
      contribution:chosen.mode==='time'?dur/60:0, notes:'Auto-planned from goal'
    };
    state.tasks.push(task); added.push(task); slotCountByGoal[chosen.id]=(slotCountByGoal[chosen.id]||0)+1;
  }
  save(); render();
  if(!silent) showToast(added.length?`Added ${added.length} goal block${added.length>1?'s':''}.`:'No goal blocks needed.');
  return added;
}

function render(){
  $('#dateLabel').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
  $('#viewTitle').textContent = navTitles[currentView] || 'Today';
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
  $('#connectionPill').textContent = config.apiUrl ? 'Sheets connected' : 'Local mode';
  const views={today:renderToday,planner:renderPlanner,tasks:renderTasks,goals:renderGoals,habits:renderHabits,ideas:renderIdeas,review:renderReview,calendar:renderCalendar,settings:renderSettings};
  views[currentView]();
}

function renderToday(){
  const date=todayISO(), tasks=getTasksForDate(date), score=dailyTaskScore(date), hp=habitScore(date);
  const completed=tasks.filter(t=>t.completed).length;
  const top3=tasks.filter(t=>t.top3 && !t.completed).slice(0,3);
  const goals=activeGoalCandidates(date).slice(0,3);
  $('#viewContainer').innerHTML=`
    <div class="grid grid-2">
      <section class="hero">
        <div class="small muted">TODAY'S FOCUS</div>
        <h2 style="font-size:27px;margin:8px 0 4px">${completed}/${tasks.length} tasks completed</h2>
        <div class="metric-line"><span>Task score</span><strong>${score.score}%</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${score.score}%"></div></div>
        <div class="section" style="margin-top:20px"><div class="small muted">HABITS</div><div style="font-size:21px;font-weight:800;margin-top:4px">${hp}%</div></div>
      </section>
      <section class="card">
        <div class="card-header"><div><h2>Today's Top 3</h2><div class="muted small">Only the three things that matter most.</div></div><button class="ghost-btn" data-action="manage-top3">Edit</button></div>
        ${top3.length?`<div class="task-list">${top3.map(taskRow).join('')}</div>`:`<div class="empty">Pick up to 3 tasks as your focus.</div>`}
      </section>
    </div>
    <div class="section grid grid-2">
      <section class="card"><div class="card-header"><div><h2>Today's tasks</h2><div class="muted small">Existing tasks + goal-generated work.</div></div><button class="primary-btn" data-action="plan-goals">Fill free time</button></div>${tasks.length?`<div class="task-list">${tasks.slice().sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99')).map(taskRow).join('')}</div>`:`<div class="empty">Nothing planned yet. Capture something or let your goals fill the gaps.</div>`}</section>
      <section class="card"><div class="card-header"><div><h2>Goal pressure</h2><div class="muted small">Weekly goals get first priority.</div></div><button class="ghost-btn" data-action="new-goal">+ Goal</button></div>${goals.length?`<div class="grid">${goals.map(goalCard).join('')}</div>`:`<div class="empty">Add a weekly, monthly or yearly goal.</div>`}</section>
    </div>
    <div class="section grid grid-3">
      <div class="kpi"><div class="kpi-title">DAILY TASK SCORE</div><div class="kpi-value">${score.score}%</div><div class="muted small">${Math.round(score.earned)}/${Math.round(score.possible)} weighted points</div></div>
      <div class="kpi"><div class="kpi-title">HABIT SCORE</div><div class="kpi-value">${hp}%</div><div class="muted small">Today</div></div>
      <div class="kpi"><div class="kpi-title">INBOX</div><div class="kpi-value">${state.inbox.filter(x=>x.status!=='archived').length}</div><div class="muted small">Capture now, sort later</div></div>
    </div>`;
}

function taskRow(t){
  const goal=getGoal(t.goalId); const status=t.completed?'done':'';
  return `<div class="task-row" data-task="${t.id}"><button class="check ${status}" data-action="toggle-task" data-id="${t.id}">${t.completed?'✓':''}</button><div><div class="task-title ${status}">${esc(t.title)}</div><div class="task-meta"><span>${t.startTime||'Anytime'} ${t.durationMin?`· ${t.durationMin}m`:''}</span><span class="badge ${t.priority}">${t.priority}</span>${goal?`<span class="badge ${goal.period}">${goal.period}</span>`:''}</div></div><div class="task-actions"><button class="icon-btn" title="Edit" data-action="edit-task" data-id="${t.id}">✎</button><button class="icon-btn" title="Delete" data-action="delete-task" data-id="${t.id}">×</button></div></div>`;
}
function goalCard(g){
  const p=goalPercent(g), pace=goalPaceStatus(g), current=goalProgress(g);
  return `<div class="goal-item"><div class="goal-top"><div><div class="goal-title">${esc(g.title)}</div><div class="goal-sub">${g.period} · ${current} / ${g.target} ${esc(g.unit||'')}</div></div><span class="badge ${pace.cls}">${pace.label}</span></div><div class="goal-progress"><div class="goal-numbers"><span>${p}% complete</span><span>${daysRemaining(g)}d left</span></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div></div></div>`;
}

function renderPlanner(){
  const date=todayISO(), tasks=getTasksForDate(date).filter(t=>t.startTime).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>Day planner</h2><div class="muted small">Goal blocks are created only in available slots.</div></div><div><button class="ghost-btn" data-action="plan-goals">Auto-fill goals</button> <button class="primary-btn" data-action="quick-task">+ Task</button></div></div>${tasks.length?`<div class="timeline">${tasks.map(t=>`<div class="timeline-row"><div class="timeline-time">${t.startTime}</div><div class="timeline-line"><div class="timeline-dot"></div></div><div class="timeline-card"><strong>${esc(t.title)}</strong><div class="task-meta">${t.durationMin||60}m · ${t.completed?'Completed':'Planned'} ${t.goalId?'· Goal':''}</div></div></div>`).join('')}</div>`:`<div class="empty">No timed tasks. Add a task or let the planner fill your free time.</div>`}</section>`;
}

function renderTasks(){
  const tasks=state.tasks.slice().sort((a,b)=>b.date.localeCompare(a.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')));
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>All tasks</h2><div class="muted small">Weighted scores reward important work and goal progress.</div></div><button class="primary-btn" data-action="quick-task">+ Add task</button></div>${tasks.length?`<div class="task-list">${tasks.map(taskRow).join('')}</div>`:`<div class="empty">No tasks yet.</div>`}</section>`;
}

function renderGoals(){
  const buckets=['weekly','monthly','yearly'];
  $('#viewContainer').innerHTML=`<div class="grid grid-3">${buckets.map(p=>`<section class="card"><div class="card-header"><div><h2>${p[0].toUpperCase()+p.slice(1)}</h2><div class="muted small">Priority ${goalWeight(p)}.</div></div><button class="ghost-btn" data-action="new-goal" data-period="${p}">+</button></div>${state.goals.filter(g=>g.period===p&&g.active!==false).map(goalCard).join('') || `<div class="empty">No ${p} goals.</div>`}</section>`).join('')}</div><section class="section card"><div class="card-header"><div><h2>How progress works</h2><div class="muted small">Goal progress and daily task score stay separate so you can see both.</div></div></div><div class="grid grid-3"><div class="kpi"><div class="kpi-title">WEEKLY PRIORITY</div><div class="kpi-value">3×</div><div class="muted small">Highest auto-planning weight</div></div><div class="kpi"><div class="kpi-title">MONTHLY PRIORITY</div><div class="kpi-value">2×</div><div class="muted small">Second priority</div></div><div class="kpi"><div class="kpi-title">YEARLY PRIORITY</div><div class="kpi-value">1×</div><div class="muted small">Background progress</div></div></div></section>`;
}

function renderHabits(){
  const days=[-6,-5,-4,-3,-2,-1,0].map(d=>{const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().slice(0,10)});
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>Habits</h2><div class="muted small">Consistency matters more than a perfect streak.</div></div><button class="primary-btn" data-action="new-habit">+ Habit</button></div>${state.habits.length?`<div class="habit-grid"><div></div>${days.map(d=>`<div>${new Date(`${d}T12:00:00`).toLocaleDateString(undefined,{weekday:'narrow'})}</div>`).join('')}${state.habits.map(h=>`<div class="habit-name"><strong>${esc(h.icon||'•')} ${esc(h.name)}</strong><div class="small muted">${habitStats(h).score}% · ${habitStats(h).streak}d streak</div></div>${days.map(d=>`<button class="habit-cell ${isHabitDone(h.id,d)?'done':''}" data-action="toggle-habit" data-id="${h.id}" data-date="${d}">${isHabitDone(h.id,d)?'✓':''}</button>`).join('')}`).join('')}</div>`:`<div class="empty">Add your first habit.</div>`}</section>`;
}
function habitStats(h){
  let score=0; for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);if(isHabitDone(h.id,d.toISOString().slice(0,10)))score++;}
  let streak=0; for(let i=0;i<365;i++){const d=new Date();d.setDate(d.getDate()-i);if(isHabitDone(h.id,d.toISOString().slice(0,10)))streak++; else break;}
  return {score:Math.round(score/30*100), streak};
}

function renderIdeas(){
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>Ideas & creativity</h2><div class="muted small">Ideas are not obligations. Capture them without cluttering your task list.</div></div><button class="primary-btn" data-action="new-idea">+ Idea</button></div><div>${state.ideas.length?state.ideas.slice().reverse().map(i=>`<div class="idea-card"><div class="goal-top"><div><strong>${esc(i.title)}</strong><div class="small muted">${fmtShortDate(i.date)} · ${esc(i.status||'New')}</div></div><button class="icon-btn" data-action="delete-idea" data-id="${i.id}">×</button></div><div class="muted" style="margin-top:8px">${esc(i.description||'')}</div></div>`).join(''):`<div class="empty">Capture your next idea.</div>`}</div></section>`;
}

function renderReview(){
  const date=todayISO(), score=dailyTaskScore(date), hs=habitScore(date); const review=state.reviews[date]||{};
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>Daily review</h2><div class="muted small">Keep this to a minute or two.</div></div></div><div class="score-grid"><div><div class="score-ring" style="--score:${score.score}"><div><strong>${score.score}</strong><span class="small muted">task score</span></div></div></div><div class="kpi"><div class="kpi-title">HABITS</div><div class="kpi-value">${hs}%</div></div><div class="kpi"><div class="kpi-title">OVERALL</div><div class="kpi-value">${Math.round(score.score*.7+hs*.3)}%</div></div></div><div class="section form-grid"><div class="field full"><label>What went well?</label><textarea id="reviewWent">${esc(review.went||'')}</textarea></div><div class="field"><label>What distracted you?</label><textarea id="reviewDistracted">${esc(review.distracted||'')}</textarea></div><div class="field"><label>Tomorrow's priority</label><textarea id="reviewTomorrow">${esc(review.tomorrow||'')}</textarea></div></div><div class="form-actions"><button class="primary-btn" data-action="save-review">Save review</button></div></section>`;
}

function renderCalendar(){
  const now=new Date(), y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1); const last=new Date(y,m+1,0); const startDay=(first.getDay()+6)%7;
  const cells=[]; for(let i=0;i<startDay;i++){const d=new Date(y,m,1-startDay+i);cells.push({date:d.toISOString().slice(0,10),other:true});} for(let d=1;d<=last.getDate();d++){const x=new Date(y,m,d);cells.push({date:x.toISOString().slice(0,10),other:false});}
  while(cells.length%7) {const d=new Date(y,m+1,cells.length-(startDay+last.getDate())+1);cells.push({date:d.toISOString().slice(0,10),other:true});}
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><div class="muted small">Task score for each day.</div></div></div><div class="calendar">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-head">${d}</div>`).join('')}${cells.map(c=>{const s=dailyTaskScore(c.date);return `<button class="cal-day ${c.other?'other':''} ${c.date===todayISO()?'today':''}" data-action="open-day" data-date="${c.date}"><span class="cal-num">${new Date(`${c.date}T12:00:00`).getDate()}</span><span class="small muted">${getTasksForDate(c.date).filter(t=>t.completed).length}/${getTasksForDate(c.date).length}</span><span class="cal-meter"><span style="display:block;width:${s.score}%"></span></span></button>`}).join('')}</div></section>`;
}

function renderSettings(){
  $('#viewContainer').innerHTML=`<section class="card"><div class="card-header"><div><h2>Settings</h2><div class="muted small">Planner behavior and Google Sheets connection.</div></div></div><div class="form-grid"><div class="field"><label>Wake time</label><input id="setWake" type="time" value="${state.settings.wake}"></div><div class="field"><label>Sleep time</label><input id="setSleep" type="time" value="${state.settings.sleep}"></div><div class="field"><label>Keep free / buffer (%)</label><input id="setBuffer" type="number" min="0" max="70" value="${state.settings.bufferPercent}"></div><div class="field full"><label>Google Apps Script Web App URL</label><input id="apiUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(config.apiUrl||'')}"></div></div><div class="form-actions"><button class="ghost-btn" data-action="export-json">Export data</button><button class="primary-btn" data-action="save-settings">Save settings</button></div><div class="section"><h3>Google Sheets</h3><p class="muted small">Paste the deployed Apps Script URL. The app can keep working in local mode until you connect it.</p></div></section>`;
}

function openModal(html){ $('#modal').innerHTML=html; $('#modalBackdrop').classList.remove('hidden'); }
function closeModal(){ $('#modalBackdrop').classList.add('hidden'); }

function taskForm(task=null){
  const t=task||{};
  openModal(`<div class="card-header"><div><h2>${task?'Edit task':'Add task'}</h2><div class="muted small">Keep it specific and easy to complete.</div></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="taskForm" class="form-grid"><div class="field full"><label>Task</label><input name="title" required value="${esc(t.title||'')}"></div><div class="field"><label>Date</label><input name="date" type="date" required value="${t.date||todayISO()}"></div><div class="field"><label>Time</label><input name="startTime" type="time" value="${t.startTime||''}"></div><div class="field"><label>Duration (minutes)</label><input name="durationMin" type="number" min="15" step="15" value="${t.durationMin||30}"></div><div class="field"><label>Priority</label><select name="priority"><option value="high" ${t.priority==='high'?'selected':''}>High</option><option value="medium" ${t.priority==='medium'?'selected':''}>Medium</option><option value="low" ${t.priority==='low'?'selected':''}>Low</option></select></div><div class="field"><label>Category</label><input name="category" value="${esc(t.category||'Personal')}"></div><div class="field"><label>Goal</label><select name="goalId"><option value="">No goal</option>${state.goals.filter(g=>g.active!==false).map(g=>`<option value="${g.id}" ${t.goalId===g.id?'selected':''}>${esc(g.period)} · ${esc(g.title)}</option>`).join('')}</select></div><div class="field"><label>Top 3</label><select name="top3"><option value="false">No</option><option value="true" ${t.top3?'selected':''}>Yes</option></select></div><div class="field full"><label>Notes</label><textarea name="notes">${esc(t.notes||'')}</textarea></div><div class="form-actions field full"><button type="button" class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Save task</button></div></form>`);
  $('#taskForm').addEventListener('submit', e=>{e.preventDefault(); const fd=new FormData(e.target); const goal=fd.get('goalId'); const obj={id:t.id||uid('task'),title:fd.get('title').trim(),date:fd.get('date'),startTime:fd.get('startTime'),durationMin:Number(fd.get('durationMin')||30),priority:fd.get('priority'),category:fd.get('category'),goalId:goal||'',goalPeriod:goal?(getGoal(goal)?.period||''):'',top3:fd.get('top3')==='true',notes:fd.get('notes'),completed:t.completed||false,status:'open',progress:t.progress||0,contribution:t.contribution||0}; if(task){const i=state.tasks.findIndex(x=>x.id===task.id);state.tasks[i]=obj;}else state.tasks.push(obj); save(); closeModal(); render(); syncIfConnected('save',obj); showToast('Task saved');});
}

function goalForm(period='weekly', goal=null){
  const g=goal||{};
  openModal(`<div class="card-header"><div><h2>${goal?'Edit goal':'Add goal'}</h2><div class="muted small">Make the outcome measurable.</div></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="goalForm" class="form-grid"><div class="field full"><label>Goal</label><input name="title" required placeholder="e.g. Finish 20 hours of ML course" value="${esc(g.title||'')}"></div><div class="field"><label>Period</label><select name="period"><option value="weekly" ${period==='weekly'?'selected':''}>Weekly</option><option value="monthly" ${period==='monthly'?'selected':''}>Monthly</option><option value="yearly" ${period==='yearly'?'selected':''}>Yearly</option></select></div><div class="field"><label>Target number</label><input name="target" type="number" step="0.01" min="0.01" required value="${g.target||20}"></div><div class="field"><label>Unit</label><input name="unit" placeholder="hours / books / sessions" value="${esc(g.unit||'hours')}"></div><div class="field"><label>Tracking mode</label><select name="mode"><option value="time" ${g.mode==='time'?'selected':''}>Time-based</option><option value="count" ${g.mode==='count'?'selected':''}>Count-based</option><option value="manual" ${g.mode==='manual'?'selected':''}>Manual</option></select></div><div class="field"><label>Current progress</label><input name="current" type="number" step="0.01" min="0" value="${g.current||0}"></div><div class="field"><label>Planning time across this goal (minutes)</label><input name="planningMinutes" type="number" min="0" value="${g.planningMinutes||''}" placeholder="e.g. 1200"></div><div class="field"><label>Start date</label><input name="startDate" type="date" value="${g.startDate||todayISO()}"></div><div class="field"><label>End date</label><input name="endDate" type="date" required value="${g.endDate||goalEndDate(period)}"></div><div class="field full"><label>Notes</label><textarea name="notes">${esc(g.notes||'')}</textarea></div><div class="form-actions field full"><button type="button" class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Save goal</button></div></form>`);
  $('#goalForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);const obj={id:g.id||uid('goal'),title:fd.get('title').trim(),period:fd.get('period'),target:Number(fd.get('target')),unit:fd.get('unit'),mode:fd.get('mode'),current:Number(fd.get('current')||0),startDate:fd.get('startDate'),endDate:fd.get('endDate'),active:true,autoCount:false,planningMinutes:Number(fd.get('planningMinutes')||0),notes:fd.get('notes')};if(g.id){const i=state.goals.findIndex(x=>x.id===g.id);state.goals[i]=obj;}else state.goals.push(obj);save();closeModal();render();syncIfConnected('saveGoal',obj);showToast('Goal saved');});
}
function goalEndDate(period){const d=new Date(); if(period==='weekly')d.setDate(d.getDate()+6); if(period==='monthly')d.setMonth(d.getMonth()+1); if(period==='yearly')d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10);}
function habitForm(){
  openModal(`<div class="card-header"><div><h2>Add habit</h2><div class="muted small">Make it simple enough to do consistently.</div></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="habitForm" class="form-grid"><div class="field"><label>Name</label><input name="name" required placeholder="Read"></div><div class="field"><label>Icon</label><input name="icon" value="✓" maxlength="3"></div><div class="field"><label>Frequency</label><select name="frequency"><option>Daily</option><option>Weekdays</option></select></div><div class="field full"><div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Save habit</button></div></div></form>`);
  $('#habitForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);const obj={id:uid('habit'),name:fd.get('name'),icon:fd.get('icon')||'✓',frequency:fd.get('frequency'),active:true};state.habits.push(obj);save();closeModal();render();syncIfConnected('saveHabit',obj);showToast('Habit added');});
}
function ideaForm(){
  openModal(`<div class="card-header"><div><h2>Capture an idea</h2><div class="muted small">No need to turn it into a task yet.</div></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="ideaForm" class="form-grid"><div class="field full"><label>Title</label><input name="title" required placeholder="New app idea..."></div><div class="field full"><label>Description</label><textarea name="description"></textarea></div><div class="field"><label>Status</label><select name="status"><option>New</option><option>Exploring</option><option>Building</option><option>Done</option><option>Archived</option></select></div><div class="field"><div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Save idea</button></div></div></form>`);
  $('#ideaForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);const obj={id:uid('idea'),date:todayISO(),title:fd.get('title'),description:fd.get('description'),status:fd.get('status')};state.ideas.push(obj);save();closeModal();render();syncIfConnected('saveIdea',obj);showToast('Idea captured');});
}

function captureForm(){
  openModal(`<div class="card-header"><div><h2>Quick capture</h2><div class="muted small">Dump it here. Organize it later.</div></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="captureForm" class="form-grid"><div class="field full"><label>What is on your mind?</label><input name="text" autofocus required placeholder="Call dentist, research laptop, project idea..."></div><div class="field"><label>Save as</label><select name="type"><option value="inbox">Inbox</option><option value="task">Task</option><option value="idea">Idea</option></select></div><div class="field"><div class="form-actions"><button type="button" class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Capture</button></div></div></form>`);
  $('#captureForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);const text=fd.get('text').trim();const type=fd.get('type');if(type==='task') state.tasks.push({id:uid('task'),title:text,date:todayISO(),startTime:'',durationMin:30,priority:'medium',category:'Inbox',goalId:'',goalPeriod:'',top3:false,completed:false,status:'open',progress:0,contribution:0,notes:''});else if(type==='idea')state.ideas.push({id:uid('idea'),date:todayISO(),title:text,description:'',status:'New'});else state.inbox.push({id:uid('inbox'),date:todayISO(),text,status:'new'});save();closeModal();render();showToast('Captured');});
}

function saveReview(){
  const date=todayISO(); state.reviews[date]={went:$('#reviewWent')?.value||'',distracted:$('#reviewDistracted')?.value||'',tomorrow:$('#reviewTomorrow')?.value||''}; save(); syncIfConnected('saveReview',state.reviews[date]); showToast('Review saved'); }

async function syncIfConnected(action,payload){
  if(!config.apiUrl) return;
  try{
    await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload})});
  }catch(e){ console.warn('Sync failed',e); showToast('Saved locally; Sheets sync failed'); }
}
async function pullFromSheets(){
  if(!config.apiUrl) return;
  try{ const r=await fetch(`${config.apiUrl}?action=bootstrap`,{method:'GET'}); const d=await r.json(); if(d.ok&&d.state){state=d.state;saveLocal();render();showToast('Loaded from Google Sheets');} }
  catch(e){ console.warn(e); }
}

function setupEvents(){
  document.addEventListener('click', e=>{
    const nav=e.target.closest('[data-view]'); if(nav){ currentView=nav.dataset.view; render(); $('#sidebar').classList.remove('open'); return; }
    const action=e.target.closest('[data-action]'); if(!action)return; const a=action.dataset.action;
    if(a==='close-modal') return closeModal();
    if(a==='quick-task') return taskForm();
    if(a==='new-goal') return goalForm(action.dataset.period||'weekly');
    if(a==='new-habit') return habitForm();
    if(a==='new-idea') return ideaForm();
    if(a==='capture') return captureForm();
    if(a==='plan-goals') return autoPlanToday();
    if(a==='toggle-task'){const t=state.tasks.find(x=>x.id===action.dataset.id);if(t){t.completed=!t.completed;t.progress=t.completed?100:0;save();syncIfConnected('save',t);render();}return;}
    if(a==='edit-task'){const t=state.tasks.find(x=>x.id===action.dataset.id);if(t)taskForm(t);return;}
    if(a==='delete-task'){state.tasks=state.tasks.filter(x=>x.id!==action.dataset.id);save();syncIfConnected('deleteTask',{id:action.dataset.id});render();showToast('Task deleted');return;}
    if(a==='toggle-habit'){const key=`${action.dataset.id}_${action.dataset.date}`;if(state.habitLogs[key])delete state.habitLogs[key];else state.habitLogs[key]=true;save();syncIfConnected('habitLog',{habitId:action.dataset.id,date:action.dataset.date,completed:!!state.habitLogs[key]});render();return;}
    if(a==='save-review') return saveReview();
    if(a==='save-settings'){state.settings.wake=$('#setWake').value;state.settings.sleep=$('#setSleep').value;state.settings.bufferPercent=Number($('#setBuffer').value);config.apiUrl=$('#apiUrl').value.trim();localStorage.setItem(CONFIG_KEY,JSON.stringify(config));save();render();syncIfConnected('saveSettings',state.settings);showToast('Settings saved'); if(config.apiUrl)pullFromSheets(); return;}
    if(a==='export-json'){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='progress-backup.json';a.click();URL.revokeObjectURL(url);return;}
    if(a==='delete-idea'){state.ideas=state.ideas.filter(x=>x.id!==action.dataset.id);save();render();return;}
    if(a==='open-day'){const d=action.dataset.date;const tasks=getTasksForDate(d);openModal(`<div class="card-header"><div><h2>${fmtDate(d)}</h2><div class="muted small">Task score ${dailyTaskScore(d).score}%</div></div><button class="icon-btn" data-action="close-modal">×</button></div>${tasks.length?`<div class="task-list">${tasks.map(taskRow).join('')}</div>`:`<div class="empty">No tasks recorded.</div>`}`);return;}
  });
  $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
  $('#quickAddBtn').addEventListener('click',()=>taskForm());
  $('#captureBtn').addEventListener('click',()=>captureForm());
  $('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
}

setupEvents();
render();
