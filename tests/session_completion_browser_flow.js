(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const $=id=>document.getElementById(id),dot=id=>document.querySelector(`[data-completion-session="${id}"]`),wait=()=>new Promise(r=>setTimeout(r,900)),assert=(v,m)=>{if(!v)throw Error(m)};
 $('auto-summary').checked=false;
 assert(dot('s2').hidden,'Existing uncompleted session has no marker');
 document.querySelector('[data-coaching-step="finish"]').click();
 window.fixtureSaveFailure=true;$('finish-consultation').click();await wait();
 assert(dot('s2').hidden,'Failed save does not show completion');
 window.fixtureSaveFailure=false;$('retry-save').click();await wait();
 assert(!dot('s2').hidden,'Successful retry shows completion');
 assert(dot('s1').hidden,'Other session remains incomplete');
 const records=await fetch('/test-data/mental_sessions').then(r=>r.json());
 assert(records.s2.completedAt&&records.s2.completedBy==='test-coach','Completion persisted');
 $('add-session').click();document.querySelector('[data-coaching-step="finish"]').click();$('finish-consultation').click();await wait();
 assert($('finish-feedback').textContent.includes('먼저'),'Empty consultation cannot complete');
 return 'PASS: completion persistence, save failure/retry, session isolation, empty-session validation';
})()
