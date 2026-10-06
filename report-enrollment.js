export function findEnrolledPlayer(players, sourceId) {
  return Object.values(players).filter(p=>p.source!=='2026mental2'||p.managed===true).find(p => p.reportSourcePlayerId === sourceId || (p.id === sourceId && ['2026mental2','mental-report'].includes(p.source)));
}
export function filterReportRoster(roster, query) {
  const clean=value=>String(value||'').normalize('NFC').toLocaleLowerCase().replace(/\s/g,'');
  const q=clean(query);
  return Object.values(roster).filter(p=>!q||clean(p.name).includes(q)||clean(p.number).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'ko')||String(a.number||'').localeCompare(String(b.number||'')));
}
export function reportEnrollmentFields(source) {
  if(!source?.id||!source.name)throw new Error('리포트 선수를 선택해주세요.');
  return {name:source.name,number:source.number||'',birth:/^\d{4}-\d{2}-\d{2}$/.test(source.birth||'')?source.birth:'',sex:['남','여'].includes(source.sex)?source.sex:'',organization:source.organization||'',reportUrl:`./reports/2026mental2/index.html?player=${encodeURIComponent(source.id)}`};
}
