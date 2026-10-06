(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const $=id=>document.getElementById(id),check=(ok,message)=>{if(!ok)throw Error(message)},pause=()=>new Promise(r=>setTimeout(r,850));
 check($('chart').dataset.coachingStep==='prepare','Starts with preparation');
 check(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 $('start-prepared-session').click();
 check($('chart').dataset.coachingStep==='record','New consultation opens record');
 $('session-note').value='UX 검증: 경기 중 호흡 연습';$('session-note').dispatchEvent(new Event('input',{bubbles:true}));
 document.querySelector('.record-next button').click();
 check($('finish-recap').textContent.includes('경기 중 호흡'),'Wrap-up shows current note');
 check(getComputedStyle($('session-note').parentElement).display==='none','Wrap-up reduces editing clutter');
 $('session-next').value='다음 훈련에서 호흡 세 번';$('session-next').dispatchEvent(new Event('input',{bubbles:true}));
 await pause();$('finish-consultation').click();await pause();
 check($('finish-feedback').textContent.includes('저장되었습니다'),'Confirms saved consultation');
 const data=await fetch('/test-data/mental_sessions').then(r=>r.json());
 check(Object.values(data).some(s=>s.note==='UX 검증: 경기 중 호흡 연습'&&s.next==='다음 훈련에서 호흡 세 번'),'Both fields persisted');
 window.fixtureSaveFailure=true;
 $('session-next').value='저장 실패 검증';$('session-next').dispatchEvent(new Event('input',{bubbles:true}));
 $('finish-consultation').click();await pause();
 check(!$('finish-feedback').textContent.includes('저장되었습니다'),'Failed save never claims success');
 window.fixtureSaveFailure=false;$('retry-save').click();await pause();
 const selected=$('chart-player').value;const other=[...$('chart-player').options].find(o=>o.value&&o.value!==selected);$('chart-player').value=other.value;$('chart-player').dispatchEvent(new Event('change',{bubbles:true}));
 check($('chart').dataset.coachingStep==='prepare','Athlete switch resets preparation');
 check(!$('finish-feedback').textContent,'No stale completion feedback');
 return 'PASS: preparation, note, wrap-up, persistence, failed-save feedback, athlete switch, mobile overflow';
})()
