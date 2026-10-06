export const CORE=['경기긴장도','사회적 도움 활용','경기 준비 능력','실수 후 회복력','자기 통제력'];
export const DETAIL=['경기 안정성','경기 중 감정 조절','외부평가 독립성','자기주도 학습능력','이미지트레이닝 활용능력','주위 적응 및 활용 능력','실패 후 회복력','훈련 태도 지수'];
export const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=6;
export function profileFor(reports,sourceId,reference={}){
 const own=reports.filter(r=>r.playerId===sourceId).sort((a,b)=>String(b.date||b.record?.date||'').localeCompare(String(a.date||a.record?.date||''))||String(b.id).localeCompare(String(a.id)));
 if(!own.length)return null;
 const record=own[0].record,stage=record.growth?.stage;
 const peers=stage?reports.filter(r=>r.record?.growth?.stage===stage):[];
 const metrics=[...CORE,...DETAIL].map(name=>{const values=peers.map(r=>r.record.raw?.[name]).filter(valid);const ref=reference[stage]?.[name];const mean=ref?ref.mean:values.length?values.reduce((s,v)=>s+v,0)/values.length:null;const value=record.raw?.[name];return {name,value:valid(value)?value:null,mean:valid(mean)?mean:null,n:ref?.n??values.length,delta:valid(value)&&valid(mean)?Number((value-mean).toFixed(2)):null};});
 return {record,stage,metrics,strengths:metrics.filter(m=>m.delta!==null&&m.delta>=.3).sort((a,b)=>b.delta-a.delta).slice(0,3),focus:metrics.filter(m=>m.delta!==null&&m.delta<=-.3).sort((a,b)=>a.delta-b.delta).slice(0,3),caution:metrics.some(m=>m.value>=5.5)};
}
export function recentDiary(player,sessions){
 return [...(player?.diaryEntries||[]).map(d=>({...d,source:'공유 다이어리'})),...sessions.filter(s=>s.diary?.trim()).map(s=>({id:s.id,date:s.date,note:s.diary,source:'상담 회고'}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,4);
}
export function deleteNote(session,uid,at=new Date().toISOString()){
 if(!session?.note?.trim())return null;
 return {note:'',noteDeletionHistory:[...(session.noteDeletionHistory||[]),{id:crypto.randomUUID(),text:session.note,deletedAt:at,deletedBy:uid}]};
}
export const DIARY_ACTIONS=['숨을 고른 나','도움을 말한 나','스스로 준비한 나','다시 도전한 나','집중을 되찾은 나','나를 돌본 나'];
export const MOODS=['힘든 날','조금 지침','평온해요','괜찮아요','아주 좋아'];
export function diaryRows(player){
 return Object.values(player?.diaryRecords||{}).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
export function validateDiaryBackup(value){
 if(!value||!Array.isArray(value.records)||value.records.length>1500)throw Error('다이어리 백업 파일 형식을 확인해주세요.');
 for(const r of value.records){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||!Number.isInteger(r.mood)||r.mood<1||r.mood>5||!Array.isArray(r.mental)||r.mental.some(i=>!Number.isInteger(i)||i<0||i>5)||!Array.isArray(r.routines)||!Array.isArray(r.areas))throw Error('다이어리 기록의 날짜·마음·시도 항목을 확인해주세요.');}
 if(new TextEncoder().encode(JSON.stringify(value.records)).length>650000)throw Error('백업 파일이 큽니다. 기록을 나누어 가져와주세요.');
 return value;
}
export function mergeDiaryRecords(existing,records){
 const result={...existing};for(const r of records){const old=result[r.date];if(!old||String(r.updatedAt||'')>=String(old.updatedAt||''))result[r.date]={...r};}return result;
}
export function growthIdentity(g={}){
 const age=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const months=v=>age(v)?`${Math.floor(Math.round(v)/12)}세 ${Math.round(v)%12}개월`:'미확인';
 const delta=typeof g.differenceMonths==='number'&&Number.isFinite(g.differenceMonths)?g.differenceMonths:age(g.boneMonths)&&age(g.chronologicalMonths)?g.boneMonths-g.chronologicalMonths:null;
 return {stage:g.stage||'단계 미확인',bone:months(g.boneMonths),chronological:months(g.chronologicalMonths),difference:delta===null?'차이 미확인':`${delta>0?'+':delta<0?'−':''}${Math.abs(Math.round(delta))}개월`,kind:delta===null?'성장 유형 미확인':delta<=-6?'지연성장':delta>=6?'조기성장':'평균성장'};
}
