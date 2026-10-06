(async()=>{
 if(location.port!=='8790')throw Error('Use the isolated browser fixture.');
 const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label)};
 q('#auto-summary').checked=false;
 q('[data-coaching-step=record]').click();
 const editor=q('.consultation-editor').getBoundingClientRect(),rail=q('.session-rail').getBoundingClientRect();
 assert(editor.left>rail.left&&editor.width>rail.width*3,'desktop keeps sessions before the wide consultation editor');
 assert(q('.session-rail').compareDocumentPosition(q('.consultation-editor'))&Node.DOCUMENT_POSITION_FOLLOWING,'keyboard reading order matches visual order');
 assert(getComputedStyle(q('#coach-profile')).display==='none','report snapshot stays in preparation while recording');
 assert(q('.summary-dock').classList.contains('collapsed'),'AI summary starts collapsed');
 q('[data-session="s1"]').click();q('#session-next').value='훈련 전 호흡 루틴 실행';q('#session-next').dispatchEvent(new Event('input',{bubbles:true}));
 q('[data-session="s2"]').click();assert(!q('#previous-session-plan').hidden&&q('#previous-session-plan').textContent.includes('훈련 전 호흡 루틴 실행'),'previous action is available beside current counseling');
 const original=q('#session-note').value;const longNote=Array.from({length:30},(_,i)=>`${i+1}. 선수의 표현과 상담 관찰을 기록합니다.`).join('\n');
 q('#session-note').value=longNote;q('#session-note').dispatchEvent(new Event('input',{bubbles:true}));
 q('[data-session="s1"]').click();q('[data-session="s2"]').click();assert(q('#session-note').value===longNote,'long notes survive session switching');
 assert(document.documentElement.scrollWidth<=innerWidth,'long notes cause no horizontal page overflow');
 q('#session-note').value=original;q('#session-note').dispatchEvent(new Event('input',{bubbles:true}));await wait(800);
 const saved=await fetch('/test-data/mental_sessions').then(r=>r.json());assert(saved.s1.next==='훈련 전 호흡 루틴 실행','rearranged fields still autosave');assert(saved.s2.note===original,'test note restored');
 return {passed:checks.length,checks};
})()
