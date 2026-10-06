import { readApiResponse, apiErrorMessage } from './api.js';
export const sections = [['issues','주요 이슈'],['selfAwareness','선수 자기인식'],['gameTraining','경기/훈련 상황'],['coaching','상담 핵심'],['followUp','다음 회차 확인사항']];
export function summaryText(summary) {
  if (!summary || sections.some(([key]) => !Array.isArray(summary[key]) || summary[key].some(v => typeof v !== 'string'))) throw new Error('상담요약 형식을 확인해주세요.');
  return '[Mental Performance 상담 요약]\n\n' + sections.map(([key,title]) => `■ ${title}\n${summary[key].map(v=>`- ${v}`).join('\n') || '- 미기록'}`).join('\n\n');
}
export function appendSummary(note, summary, date) {
  const body = summaryText(summary).replace('[Mental Performance 상담 요약]\n\n','');
  return (note ? note + '\n\n--------------------\n\n' : '') + `[AI 상담 요약 / ${date}]\n\n` + body;
}

export function createRecording({context, token, insert, ready, notify, root = document.getElementById('consultation-recording')}) {
  const $ = name => root.querySelector(`[data-recording="${name}"]`);
  let draft = null, recorder = null, stream = null, chunks = [], audio = null, request = null, serial = 0;
  let segments = [], speakerRoles = {};
  let phase = 'idle', elapsed = 0, started = 0, timer = null, transcript = '', summary = null;
  const same = () => draft && context()?.playerId === draft.playerId && context()?.sessionId === draft.sessionId && context()?.uid === draft.uid;
  const active = () => phase !== 'idle';
  function release() {
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; if (recorder.state !== 'inactive') recorder.stop(); }
    stream?.getTracks().forEach(track=>track.stop()); stream = null; recorder = null; chunks = []; clearInterval(timer); timer = null;
  }
  function reset(message = '') {
    serial++; request?.abort(); request = null; release(); draft = null; audio = null; transcript = ''; summary = null; segments = [];speakerRoles = {};elapsed = 0; phase = 'idle';
    $('transcript').textContent = ''; $('summary').textContent = ''; render(message);
  }
  function render(message) {
    const busy = ['permission','upload','transcribe','summarize'].includes(phase);
    $('start').hidden = phase !== 'idle'; $('start').disabled = !context() || !ready();
    $('pause').hidden = !['recording','paused'].includes(phase); $('pause').textContent = phase === 'paused' ? '▶ 재개' : '⏸ 일시정지';
    $('stop').hidden = !['recording','paused'].includes(phase);
    $('cancel').hidden = phase === 'idle';
    $('retry').hidden = phase !== 'transcription-error';
    $('preview').hidden = !transcript; $('transcript').textContent = transcript;
    $('summary').textContent = summary ? summaryText(summary) : '';
    $('insert').hidden = !summary; $('insert').disabled = busy;
    $('resummarize').hidden = !transcript; $('resummarize').disabled = busy;
    const seconds = Math.floor((elapsed + (phase === 'recording' ? performance.now() - started : 0)) / 1000);
    const time = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    const status = {idle: ready() ? '선수와 회차를 선택하고 상담 당사자의 동의를 받은 뒤 녹음하세요.' : '상담 녹음은 승인된 코치 로그인 후 사용할 수 있습니다.',permission:'마이크 연결 중…',recording:`● 녹음 중 ${time}`,paused:`일시정지 ${time}`,upload:'음성 업로드 중…',transcribe:'AI 전사 중…',summarize:'상담 내용 정리 중…',complete:'완료 · 내용을 확인하고 메모에 삽입하세요.'};
    $('status').textContent = message || status[phase] || '다시 시도해주세요.';
    const speakerBox=$('speakers');speakerBox.replaceChildren();
    const people=[...new Map(segments.map(s=>[s.speaker,s.label])).entries()];
    for(const [speaker,label] of people){
      const row=document.createElement('label');row.textContent=label+' 역할 ';
      const select=document.createElement('select');select.setAttribute('aria-label',label+' 역할');select.disabled=busy;
      for(const role of ['', '선수','멘탈코치','보호자','기타']){const option=document.createElement('option');option.value=role;option.textContent=role||'미지정';select.append(option)}
      select.value=speakerRoles[speaker]||'';select.onchange=()=>{
        speakerRoles[speaker]=select.value;transcript=segments.map(s=>(speakerRoles[s.speaker]||s.label)+': '+s.text).join('\n');
        summary=null;phase='summary-error';render('화자 역할을 반영했습니다. 다시 요약을 눌러 확인해주세요.');
      };row.append(select);speakerBox.append(row);
    }
    root.setAttribute('aria-busy',String(busy));
  }
  async function call(endpoint, body, contentType, generation) {
    request = new AbortController();
    const deadline = setTimeout(()=>request?.abort(),180000);
    try {
      const bearer = await token();
      if (generation !== serial || !same()) throw new DOMException('취소됨','AbortError');
      const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':contentType,Authorization:`Bearer ${bearer}`,'X-Player-ID':draft.playerId,'X-Session-ID':draft.sessionId},body,signal:request.signal});
      const result = await readApiResponse(response);
      if (generation !== serial || !same()) throw new DOMException('취소됨','AbortError');
      if (!response.ok) throw new Error(result.error || '상담 처리에 실패했습니다. 다시 시도해주세요.');
      if (result.playerId !== draft.playerId || result.sessionId !== draft.sessionId) throw new Error('선수와 회차를 다시 확인해주세요.');
      return result;
    } finally {clearTimeout(deadline); if(generation === serial) request = null;}
  }
  async function summarize() {
    const generation = serial;
    if (!same() || !transcript) return;
    phase = 'summarize'; summary = null; render();
    try {
      const result = await call('./api/consultation-summary',JSON.stringify({transcript}),'application/json',generation);
      summaryText(result.summary); summary = result.summary; phase = 'complete'; render();
    } catch(error) {if(generation !== serial) return; phase = 'summary-error'; render(error.name === 'AbortError' ? '요약 연결 시간이 초과되었습니다. 다시 요약해주세요.' : apiErrorMessage(error));}
  }
  async function transcribe() {
    const generation = serial;
    if (!same() || !audio) return;
    phase = 'upload'; render();
    // Fetch uploads the Blob directly; no storage archive is created.
    const progress = setTimeout(()=>{if(generation === serial && phase === 'upload'){phase='transcribe';render();}},700);
    try {
      const result = await call('./api/transcribe',audio,audio.type,generation);
      if(typeof result.transcript !== 'string' || !result.transcript.trim()) throw new Error('녹취가 비어 있습니다. 다시 시도해주세요.');
      transcript = result.transcript;
      segments=Array.isArray(result.segments) ? result.segments.filter(s=>typeof s.speaker==='string' && typeof s.label==='string' && typeof s.text==='string') : [];
      audio = null; await summarize();
    } catch(error) {if(generation !== serial) return; phase='transcription-error';render(error.name === 'AbortError' ? '전사 연결 시간이 초과되었습니다. 다시 시도해주세요.' : apiErrorMessage(error));}
    finally {clearTimeout(progress);}
  }
  $('start').onclick = async () => {
    if(active() || !ready() || !context()) return;
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {render('이 브라우저에서는 녹음할 수 없습니다. HTTPS에서 최신 Safari 또는 Chrome을 사용해주세요.');return;}
    draft = Object.freeze({...context(),recordedAt:new Date().toISOString()}); const generation = ++serial;
    phase='permission'; render();
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation !== serial || !same()){acquired.getTracks().forEach(t=>t.stop());return;}
      stream = acquired;
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(v=>MediaRecorder.isTypeSupported(v));
      recorder = new MediaRecorder(stream,mimeType ? {mimeType} : undefined); chunks=[];
      recorder.ondataavailable = event => {
        if(generation !== serial || !event.data.size) return;
        chunks.push(event.data);
        if(chunks.reduce((n,b)=>n+b.size,0) > 24*1024*1024){reset('녹음 용량 제한을 넘었습니다. 더 짧게 나누어 녹음해주세요.');}
      };
      recorder.onerror = () => reset('녹음에 실패했습니다. 마이크 연결을 확인해주세요.');
      recorder.onstop = () => {
        if(generation !== serial || !same()) return;
        audio = new Blob(chunks,{type:recorder.mimeType || chunks[0]?.type || 'audio/webm'});
        release();
        if(!audio.size){reset('녹음된 음성이 없습니다. 다시 시작해주세요.');return;}
        transcribe();
      };
      recorder.start(1000); started=performance.now(); elapsed=0;phase='recording';timer=setInterval(()=>{render();if(phase === 'recording' && elapsed+performance.now()-started >= 45*60*1000)$('stop').click();},500);render();
    } catch(error) {if(generation !== serial)return;reset(error.name === 'NotAllowedError' ? '마이크 사용 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.' : '녹음을 시작할 수 없습니다. 마이크 연결 상태를 확인해주세요.');}
  };
  $('pause').onclick = () => {
    try {
      if(phase==='recording'){recorder.pause();elapsed+=performance.now()-started;phase='paused';}
      else if(phase==='paused'){recorder.resume();started=performance.now();phase='recording';}render();
    }catch{reset('녹음을 유지할 수 없습니다. 다시 시작해주세요.');}
  };
  $('stop').onclick = () => {if(!recorder || !['recording','paused'].includes(phase))return;try{if(phase==='recording')elapsed+=performance.now()-started;phase='upload';clearInterval(timer);recorder.stop();render();}catch{reset('녹음 종료에 실패했습니다. 다시 시작해주세요.');}};
  $('retry').onclick = transcribe; $('resummarize').onclick = summarize;
  $('cancel').onclick = () => reset('녹음을 취소했습니다. 기존 메모는 유지됩니다.');
  $('insert').onclick = () => {
    if(!same() || !summary || phase!=='complete'){reset('선수 또는 회차가 변경되어 결과를 폐기했습니다.');return;}
    try {insert(draft,summary,transcript);reset();notify('상담요약을 기존 메모 뒤에 추가했습니다. 저장 상태를 확인해주세요.');}
    catch(error){render(error.message);}
  };
  window.addEventListener('pagehide',()=>reset());
  return {sync(){if(draft && !same())reset('선수 또는 회차가 변경되어 녹음과 미리보기를 폐기했습니다.');else render();},cancel:reset,active};
}
