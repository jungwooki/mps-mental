(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 document.querySelector('#auto-summary').checked=false;
 assert(document.querySelectorAll('.coach-metric').length===13,'5 plus 8 indicators shown');assert(document.querySelectorAll('.metric-row').length===3,'three metric rows');assert(document.querySelector('.type-chip').textContent.includes('실전 승부사'),'one existing type shown');assert(document.querySelector('.profile-caution'),'high score caution shown');assert(document.querySelector('.summary-dock').classList.contains('collapsed'),'summary starts collapsed');assert(document.querySelector('#coach-diary').textContent.includes('실수 후 호흡하고 다시 시작'),'existing diary content shown');assert(document.querySelector('#coach-diary').textContent.includes('많이 부담돼'),'original self checks shown');
 const before=document.querySelector('#session-note').value;document.querySelector('#delete-session-note').click();await wait(500);
 const sessions=await fetch('/test-data/mental_sessions').then(r=>r.json());assert(sessions.s2.note==='','selected memo deleted');assert(sessions.s2.noteDeletionHistory.at(-1).text===before,'deleted original retained');assert(sessions.s2.noteDeletionHistory.at(-1).deletedBy==='test-coach','deletion actor retained');assert(!!sessions.s2.noteDeletionHistory.at(-1).deletedAt,'deletion time retained');assert(sessions.s1.note==='기존 상담 메모','other session unchanged');assert(document.querySelector('#note-history-list').textContent.includes(before),'deletion history visible');
 return {passed:checks.length,checks};
})()
