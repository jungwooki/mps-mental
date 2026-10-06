import assert from 'node:assert/strict';
import {CORE,DETAIL,profileFor,deleteNote,validateDiaryBackup,mergeDiaryRecords,diaryRows,growthIdentity} from '../coach-dashboard.js';
const raw=v=>Object.fromEntries([...CORE,...DETAIL].map(n=>[n,v]));
const reports=[{id:'old',playerId:'p',date:'2026-09-01',record:{raw:raw(2),growth:{stage:'가속기'}}},{id:'new',playerId:'p',date:'2026-10-01',record:{raw:{...raw(4),'경기긴장도':5.5,'훈련 태도 지수':1},growth:{stage:'가속기'},type:'D'}},{id:'other',playerId:'q',date:'2026-10-02',record:{raw:raw(6),growth:{stage:'급성장기'}}}];
const p=profileFor(reports,'p');assert.equal(p.record.type,'D');assert.equal(p.metrics.length,13);assert.equal(p.metrics.find(m=>m.name==='경기 준비 능력').mean,3);assert.equal(p.metrics.find(m=>m.name==='경기 준비 능력').n,2);assert(p.caution);assert(p.strengths.length);assert(p.focus.some(m=>m.name==='훈련 태도 지수'));assert.equal(profileFor(reports,'absent'),null);
assert.equal(profileFor([{...reports[1],record:{...reports[1].record,growth:{}}}],'p').metrics[0].mean,null);
assert.equal(profileFor([reports[1]],'p',{'가속기':{'경기 준비 능력':{mean:2.5,n:20}}}).metrics.find(m=>m.name==='경기 준비 능력').mean,2.5);
const patch=deleteNote({note:'삭제 전 실제 메모',noteDeletionHistory:[{text:'이전 삭제'}]},'coach','2026-10-03T00:00:00Z');assert.equal(patch.note,'');assert.equal(patch.noteDeletionHistory.length,2);assert.equal(patch.noteDeletionHistory[1].text,'삭제 전 실제 메모');assert.equal(patch.noteDeletionHistory[1].deletedBy,'coach');assert.equal(deleteNote({note:''},'coach'),null);
const diary={date:'2026-10-01',mood:3,mental:[0,3],routines:[],areas:[],note:'실수 후 다시 시작',updatedAt:'2026-10-01'};assert.equal(validateDiaryBackup({records:[diary]}).records.length,1);assert.throws(()=>validateDiaryBackup({records:[{...diary,mood:7}]}));assert.throws(()=>validateDiaryBackup({records:[{...diary,mental:[7]}]}));const merged=mergeDiaryRecords({[diary.date]:diary},[{...diary,note:'오래된 기록',updatedAt:'2026-09-01'}]);assert.equal(merged[diary.date].note,diary.note);assert.equal(diaryRows({diaryRecords:merged}).length,1);
console.log('PASS: latest report, growth-stage comparison, 13 indicators, missing data, note deletion audit, original diary validation and merge');

assert.equal(growthIdentity({boneMonths:144,chronologicalMonths:156,differenceMonths:-12,stage:'가속기'}).kind,'지연성장');
assert.equal(growthIdentity({differenceMonths:-6}).kind,'지연성장');
assert.equal(growthIdentity({differenceMonths:6}).kind,'조기성장');
assert.equal(growthIdentity({differenceMonths:0}).kind,'평균성장');
assert.equal(growthIdentity({}).kind,'성장 유형 미확인');
assert.equal(growthIdentity({boneMonths:149}).bone,'12세 5개월');
