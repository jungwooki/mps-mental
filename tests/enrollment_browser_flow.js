(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
 const assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 document.querySelector('#auto-summary').checked=false;
 const count=()=>document.querySelector('#player-rows').children.length;
 const initial=count();document.querySelector('[data-add-player]').click();await wait(250);
 const search=document.querySelector('#report-player-search'),choice=document.querySelector('#report-player-choice');
 search.value='R002';search.dispatchEvent(new Event('input'));assert(choice.options.length===2,'chart number search distinguishes identical names');
 choice.value='r2';document.querySelector('#use-report-player').click();
 const f=document.querySelector('#player-form');assert(f.elements.number.value==='R002'&&f.elements.birth.value==='2001-01-01','selected identity loaded');
 assert(count()===initial,'loading does not enroll');document.querySelector('#close-player').click();assert(count()===initial,'cancel does not enroll');
 document.querySelector('[data-add-player]').click();await wait(200);choice.value='r2';document.querySelector('#use-report-player').click();f.requestSubmit();await wait(1000);
 const data=await fetch('/test-data/mental_players').then(r=>r.json());assert(Object.keys(data).length===initial+1,'explicit save enrolls only selected athlete');assert(data.r2.reportSourcePlayerId==='r2','enrollment keeps source link');
 const sessions=await fetch('/test-data/mental_sessions').then(r=>r.json());assert(sessions.s1.note==='기존 상담 메모'&&Object.keys(sessions).length===3,'existing sessions preserved');
 location.hash='mental';await wait(50);document.querySelector('[data-add-player]').click();await wait(200);choice.value='r2';document.querySelector('#use-report-player').click();await wait(100);
 assert(!document.querySelector('#player-dialog').open,'duplicate goes to existing chart');assert(count()===initial+1,'duplicate does not create another player');
 return {passed:checks.length,checks};
})()
