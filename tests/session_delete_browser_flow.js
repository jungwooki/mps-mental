(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const $=id=>document.getElementById(id),assert=(v,m)=>{if(!v)throw Error(m)},wait=()=>new Promise(r=>setTimeout(r,900));
 $('auto-summary').checked=false;
 document.querySelector('[data-session="s2"]').click();
 $('delete-consultation').click();assert($('delete-consultation-dialog').open,'Confirmation opens');
 assert($('delete-consultation-context').textContent.includes('2026-10-02'),'Identifies selected consultation');
 $('cancel-consultation-delete').click();await wait();
 assert(document.querySelector('[data-session="s2"]'),'Cancel keeps consultation');
 $('delete-consultation').click();$('confirm-consultation-delete').click();await wait();
 assert(!document.querySelector('[data-session="s2"]'),'Deleted consultation removed');
 assert(document.querySelector('[data-session="s1"]'),'Other consultation remains');
 const data=await fetch('/test-data/mental_sessions').then(r=>r.json());
 assert(data.s2.deletedAt&&data.s2.deletedBy==='test-coach','Deletion persisted with actor');
 assert(!data.s1.deletedAt&&!data.s3.deletedAt,'Other consultation and athlete unaffected');
 assert($('session-note').value===data.s1.note,'Remaining consultation selected');
 $('delete-consultation').click();$('confirm-consultation-delete').click();await wait();
 assert($('session-count').textContent==='0','Final deletion leaves empty list');
 assert($('chart').dataset.coachingStep==='prepare','Returns to preparation');
 return 'PASS: confirmation, cancel, delete, persistence, isolation, selection, last-session empty state';
})()
