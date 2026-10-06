(async()=>{
 if(location.port!=='8790')throw Error('Isolated fixture only');
 const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 q('#auto-summary').checked=false;
 const xs=['.sidebar','.athlete-column','.session-rail','.consultation-column'].map(s=>q(s).getBoundingClientRect().left);
 assert(xs.every((x,i)=>!i||x>xs[i-1]),'menu, athletes, sessions, consultation follow the reference order');
 assert(q('[data-session]').dataset.session==='s2','newest session first');
 q('#workspace-player-search').value='B002';q('#workspace-player-search').dispatchEvent(new Event('input'));
 assert(document.querySelectorAll('[data-chart-athlete]').length===1,'chart number search filters athlete list');q('[data-chart-athlete=p2]').click();
 assert(q('#session-player-name').textContent.includes('B')&&q('[data-session]').dataset.session==='s3','selecting athlete isolates the session column');
 q('#workspace-player-search').value='';q('#workspace-player-search').dispatchEvent(new Event('input'));q('[data-chart-athlete=p1]').click();
 assert(q('[data-session]').dataset.session==='s2','returning athlete selects latest session');
 const button=q('[data-session=s2]');if(button.getAttribute('aria-expanded')==='true')button.click();q('[data-session=s2]').click();assert(q('.session-expanded-note').textContent.includes('두 번째 회차'),'session expands its own memo');q('[data-session=s2]').click();assert(!q('.session-expanded-note'),'session memo folds');
 q('.consultation-toggle').click();assert(!q('#consultation-record').open,'consultation record folds downward');q('.consultation-toggle').click();assert(q('#consultation-record').open,'consultation record expands');
 const original=q('#session-note').value;q('#session-note').value=original+'\n열 배치 검증';q('#session-note').dispatchEvent(new Event('input',{bubbles:true}));q('[data-session=s1]').click();q('[data-session=s2]').click();assert(q('#session-note').value.endsWith('열 배치 검증'),'memo survives switching sessions');
 q('#session-note').value=original;q('#session-note').dispatchEvent(new Event('input',{bubbles:true}));await wait(800);assert((await fetch('/test-data/mental_sessions').then(r=>r.json())).s2.note===original,'autosave remains bound to selected session');
 assert(document.documentElement.scrollWidth<=innerWidth,'four columns fit desktop viewport');return {passed:checks.length,checks};
})()
