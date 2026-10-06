import {diaryRows} from './coach-dashboard.js';
export const chartFields = ['date','coach','topic','assessment','note','diary','next','question'];
export function orderedSessions(records, playerId) {
  return Object.values(records).filter(s=>s.playerId===playerId&&!s.deletedAt)
    .sort((a,b)=>(a.date || '').localeCompare(b.date || '') || (a.createdAt || a.id).localeCompare(b.createdAt || b.id));
}
export function completedSessions(records, playerId) {
  return orderedSessions(records,playerId).filter(s=>['topic','assessment','note','diary','next','question'].some(k=>String(s[k] || '').trim()));
}
export function latestFourInput(players, records, playerId) {
  return {player:{id:playerId,name:players[playerId]?.name || '',diaryNote:[players[playerId]?.diaryNote||'',...diaryRows(players[playerId]).slice(0,4).map(r=>'다이어리 '+r.date+' · 마음 '+r.mood+'/5 · '+JSON.stringify(r))].filter(Boolean).join('\n').slice(0,12000)},
    sessions:completedSessions(records,playerId).slice(-4).map(s=>Object.fromEntries(['id',...chartFields].map(k=>[k,s[k] || ''])))};
}
