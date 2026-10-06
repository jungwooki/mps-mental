// Run in agent-browser eval --stdin, on tests/browser_fixture.py only.
(async()=>{
 if(location.port!=='8790')throw Error('Use the isolated loopback fixture on port 8790.');
 document.getElementById('auto-summary').checked=false;
 const q=n=>document.querySelector(`[data-recording=${n}]`),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const checks=[],assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 let flags={},stopped=0,sttCalls=0;
 const originalFetch=window.fetch.bind(window);
 window.fetch=async(...args)=>{const url=String(args[0]);if(url.endsWith('/api/transcribe')){sttCalls++;if(flags.sttFail)return new Response(JSON.stringify({error:'전사 실패 테스트'}),{status:502});if(flags.delay)await wait(800);}if(url.endsWith('/api/consultation-summary')&&flags.summaryFail)return new Response(JSON.stringify({error:'요약 실패 테스트'}),{status:502});return originalFetch(...args)};
 Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{if(flags.denied)throw new DOMException('denied','NotAllowedError');if(flags.permissionDelay)await wait(800);return {getTracks:()=>[{stop(){stopped++}}]}}});
 class Recorder{static isTypeSupported(t){return t.startsWith('audio/webm')}constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}pause(){this.state='paused'}resume(){this.state='recording'}stop(){this.state='inactive';setTimeout(()=>{this.ondataavailable?.({data:new Blob(['test-audio'],{type:'audio/webm'})});this.onstop?.()},0)}}
 window.MediaRecorder=Recorder;
 const record=async()=>{q('start').click();await wait(30);q('stop').click();await wait(200)};
 const selectPlayer=id=>{const el=document.getElementById('chart-player');el.value=id;el.dispatchEvent(new Event('change'))};
 const initial=document.getElementById('session-note').value;
 q('start').click();await wait(30);assert(q('status').textContent.includes('녹음 중'),'start');q('pause').click();assert(q('status').textContent.includes('일시정지'),'pause');q('pause').click();assert(q('status').textContent.includes('녹음 중'),'resume');q('stop').click();await wait(200);
 assert(q('transcript').textContent.includes('실수'),'transcript preview');assert(q('summary').textContent.includes('■ 주요 이슈'),'summary preview');assert(document.getElementById('session-note').value===initial,'no insert before approval');q('insert').click();await wait(800);assert(document.getElementById('session-note').value.startsWith(initial+'\n\n--------------------'),'preserve existing memo');assert((await(await fetch('/test-data/mental_sessions')).json()).s2.note.includes('[AI 상담 요약 /'),'existing writer saved');
 flags={denied:true};q('start').click();await wait(30);assert(q('status').textContent.includes('권한'),'permission denied');
 flags={sttFail:true};await record();assert(!q('retry').hidden,'transcription retry');flags={summaryFail:true};q('retry').click();await wait(200);assert(q('transcript').textContent.includes('실수'),'summary failure keeps transcript');flags={};const calls=sttCalls;q('resummarize').click();await wait(200);assert(sttCalls===calls,'summary retry without STT');q('cancel').click();assert(q('transcript').textContent==='','cancel clears draft');
 flags={delay:true};q('start').click();await wait(30);q('stop').click();await wait(30);document.querySelector('[data-session=s1]').click();await wait(900);assert(!q('transcript').textContent,'late response discarded');assert(document.getElementById('session-note').value==='기존 상담 메모','other session unchanged');
 flags={};await record();selectPlayer('p2');assert(!q('transcript').textContent,'player switch clears preview');assert(document.getElementById('session-note').value==='선수 B 메모','other player unchanged');
 flags={permissionDelay:true};q('start').click();await wait(20);selectPlayer('p1');await wait(850);assert(!q('start').hidden,'permission race releases microphone');
 flags={};window.fixtureSaveFailure=true;await record();q('insert').click();await wait(800);assert(document.getElementById('session-note').value.includes('[AI 상담 요약 /'),'save failure keeps memo');assert(JSON.parse(localStorage.getItem('mps-mental-v1')).pending['sessions/s2'],'save retry queue');window.fixtureSaveFailure=false;document.getElementById('retry-save').click();await wait(300);assert(!JSON.parse(localStorage.getItem('mps-mental-v1')).pending['sessions/s2'],'save retry');assert(stopped>=6,'microphone tracks released');
 return {checks,stopped};
})()
