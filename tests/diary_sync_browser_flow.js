(async()=>{
 if(location.port!=='8790'||!location.pathname.includes('20260916'))throw Error('Isolated diary fixture only');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 assert(key==='mps-diary-player-p1','diary storage is scoped to selected player');
 const oldPersonal=localStorage.getItem('mps-diary-v1');
 draft={...extraDefaults,date:'2026-10-03',mood:2,type:'훈련한 날',mental:[0,3],body:'보통이에요',areas:[],sleep:'뒤척였어요',routines:['물을 챙겨 마셨어'],hope:'다시 한번 도전하기',note:'실수 후 호흡하고 다시 시작',stress:'많이 부담돼',fatigue:'조금 피곤해',sleepDuration:'6~7시간 미만'};save();await wait(400);
 const players=await fetch('/test-data/mental_players').then(r=>r.json());const record=players.p1.diaryRecords?.['2026-10-03'];
 assert(record?.mood===2&&record.mental.join(',')==='0,3','existing diary save reaches Firebase fixture');assert(record.stress==='많이 부담돼'&&record.sleepDuration==='6~7시간 미만','optional self checks preserved');assert(!players.p2.diaryRecords,'other player untouched');assert(localStorage.getItem('mps-diary-v1')===oldPersonal,'original personal diary untouched');assert(document.querySelector('.diary-cloud-banner').textContent.includes('저장 완료'),'cloud save status shown');
 return {passed:checks.length,checks};
})()
