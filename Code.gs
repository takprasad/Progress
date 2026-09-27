const SHEET_NAMES = ['Tasks','Goals','Habits','HabitLogs','Ideas','Inbox','DailyReview','Settings'];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    Tasks: ['id','date','startTime','durationMin','title','priority','category','goalId','goalPeriod','top3','completed','status','progress','contribution','notes'],
    Goals: ['id','title','period','target','unit','mode','current','startDate','endDate','active','autoCount','planningMinutes','notes'],
    Habits: ['id','name','icon','frequency','active'],
    HabitLogs: ['habitId','date','completed'],
    Ideas: ['id','date','title','description','status'],
    Inbox: ['id','date','text','status'],
    DailyReview: ['date','went','distracted','tomorrow'],
    Settings: ['key','value']
  };
  Object.entries(schemas).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(headers);
  });
  return {ok:true, message:'DayFlow sheets ready'};
}

function doGet(e) {
  try {
    setup();
    const action = e && e.parameter ? e.parameter.action : 'bootstrap';
    if (action === 'bootstrap') return json({ok:true, state:readState_()});
    return json({ok:true,message:'DayFlow API is running'});
  } catch (err) { return json({ok:false,error:String(err)}); }
}

function doPost(e) {
  try {
    setup();
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const p = body.payload;
    if (action === 'save') upsert_('Tasks', p);
    else if (action === 'deleteTask') deleteById_('Tasks', p.id);
    else if (action === 'saveGoal') upsert_('Goals', p);
    else if (action === 'saveHabit') upsert_('Habits', p);
    else if (action === 'habitLog') upsert_('HabitLogs', p);
    else if (action === 'saveIdea') upsert_('Ideas', p);
    else if (action === 'saveReview') upsert_('DailyReview', p, 'date');
    else if (action === 'saveSettings') { Object.keys(p || {}).forEach(k => upsert_('Settings', {key:k,value:p[k]}, 'key')); }
    else if (action === 'saveInbox') upsert_('Inbox', p);
    else throw new Error('Unknown action: ' + action);
    return json({ok:true});
  } catch (err) { return json({ok:false,error:String(err)}); }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function readState_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const state={tasks:[],goals:[],habits:[],habitLogs:{},ideas:[],inbox:[],reviews:{},settings:{wake:'07:00',sleep:'23:00',bufferPercent:20}};
  state.tasks = readObjects_(ss.getSheetByName('Tasks'));
  state.goals = readObjects_(ss.getSheetByName('Goals'));
  state.habits = readObjects_(ss.getSheetByName('Habits'));
  readObjects_(ss.getSheetByName('HabitLogs')).forEach(r=>state.habitLogs[`${r.habitId}_${r.date}`]=String(r.completed)==='true');
  state.ideas = readObjects_(ss.getSheetByName('Ideas'));
  state.inbox = readObjects_(ss.getSheetByName('Inbox'));
  readObjects_(ss.getSheetByName('DailyReview')).forEach(r=>state.reviews[r.date]=r);
  readObjects_(ss.getSheetByName('Settings')).forEach(r=>state.settings[r.key]=r.value);
  state.settings.bufferPercent=Number(state.settings.bufferPercent||20);
  return state;
}

function readObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values=sheet.getDataRange().getValues(); const headers=values[0];
  return values.slice(1).filter(row=>row.some(v=>String(v)!=='')).map(row=>{
    const o={}; headers.forEach((h,i)=>o[h]=row[i] instanceof Date ? Utilities.formatDate(row[i], Session.getScriptTimeZone(),'yyyy-MM-dd') : row[i]); return o;
  });
}

function upsert_(sheetName,obj,key) {
  if (!obj) return;
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName); const values=sh.getDataRange().getValues(); const headers=values[0];
  const matchKey=key || (headers.includes('id')?'id':headers[0]); const value=String(obj[matchKey]||''); let rowIndex=-1;
  if (value) for(let r=1;r<values.length;r++){if(String(values[r][headers.indexOf(matchKey)])===value){rowIndex=r+1;break;}}
  const row=headers.map(h=>obj[h] !== undefined ? obj[h] : '');
  if(rowIndex>0) sh.getRange(rowIndex,1,1,headers.length).setValues([row]); else sh.appendRow(row);
}

function deleteById_(sheetName,id) {
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName); const values=sh.getDataRange().getValues(); const headers=values[0]; const idx=headers.indexOf('id');
  if(idx<0) return; for(let r=1;r<values.length;r++){if(String(values[r][idx])===String(id)){sh.deleteRow(r+1);return;}}
}
