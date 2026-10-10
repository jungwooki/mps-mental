import { startCapture, joinWav, splitRecording, MAX_SECONDS } from './audio-capture.js';
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

export function createRecording({context, token, insert, ready, notify, root = document.getElementById('consultation-recording'), capture = startCapture}) {
  const $ = name => root.querySelector(`[data-recording="${name}"]`);
  let draft = null, microphone = null, request = null, serial = 0, timer = null;
  let phase = 'idle', transcript = '', summary = null, parts = [], speakerRoles = {};
  let stopped = false, processing = false, lastRequest = 0, stopMessage = '', wakeLock = null, changing = false;
  const same = () => draft && context()?.playerId === draft.playerId && context()?.sessionId === draft.sessionId && context()?.uid === draft.uid;
  const active = () => phase !== 'idle';
  const capturing = () => ['recording','paused'].includes(phase);
  function release() {
    microphone?.cancel(); microphone = null; clearInterval(timer); timer = null;
    void wakeLock?.release().catch(() => {}); wakeLock = null;
  }
  function reset(message = '') {
    serial++; request?.abort(); request = null; release();
    draft = null; transcript = ''; summary = null; parts = []; speakerRoles = {};
    stopped = false; processing = false; changing = false; stopMessage = ''; phase = 'idle';
    render(message);
  }
  function rebuild() {
    transcript = parts.flatMap(part => part.segments || []).map(segment =>
      `${speakerRoles[segment.speaker] || segment.label}: ${segment.text}`).join('\n');
  }
  function render(message) {
    const busy = ['permission','upload','summarize'].includes(phase);
    const locked = busy || capturing();
    const completed = parts.filter(part => part.segments).length;
    const failed = parts.filter(part => part.error).length;
    $('start').hidden = phase !== 'idle'; $('start').disabled = !context() || !ready();
    if ($('import')) {$('import').hidden = phase !== 'idle'; $('import').disabled = !context() || !ready();}
    $('pause').hidden = !capturing(); $('pause').disabled = changing;
    $('pause').textContent = phase === 'paused' ? '▶ 재개' : '⏸ 일시정지';
    $('stop').hidden = !capturing(); $('stop').disabled = changing;
    $('cancel').hidden = phase === 'idle';
    $('retry').hidden = phase !== 'transcription-error';
    $('preview').hidden = !transcript; $('transcript').textContent = transcript;
    $('summary').textContent = summary ? summaryText(summary) : '';
    $('insert').hidden = !summary; $('insert').disabled = locked;
    $('resummarize').hidden = !transcript || !stopped || !!failed;
    $('resummarize').disabled = locked;
    if ($('download')) $('download').hidden = !parts.length;
    const seconds = Math.floor(microphone?.seconds() ?? parts.reduce((n, part) => n + (part.audio.size - 44) / 32000, 0));
    const time = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    const progress = parts.length ? ` · 전사 ${completed}/${parts.length}구간${failed ? ` · 재시도 대기 ${failed}구간` : ''}` : '';
    const status = {
      idle: ready() ? '최대 60분 · 상담 당사자의 동의를 받은 뒤 녹음하세요. 종료 후 내용을 확인해 메모에 삽입합니다.' : '상담 녹음은 승인된 코치 로그인 후 사용할 수 있습니다.',
      permission: '마이크 연결 중…', recording: `● 녹음 중 ${time} / 60:00${progress}`,
      paused: `일시정지 ${time} / 60:00${progress}`, upload: `남은 음성 전사 중…${progress}`,
      summarize: '전체 상담 내용 정리 중…', complete: '완료 · 내용을 확인하고 메모에 삽입하세요.',
      'transcription-error': `${failed}개 구간 전사 실패 · 음성을 보관 중입니다. 다시 시도하거나 녹음 원본을 내려받으세요.`,
      'summary-error': '요약에 실패했습니다. 녹취를 확인하고 다시 요약해주세요.',
    };
    $('status').textContent = message || [stopMessage, status[phase]].filter(Boolean).join(' · ') || '다시 시도해주세요.';
    const speakerBox = $('speakers');
    // Preserve controls/focus while the timer updates the elapsed recording time.
    const people = [...new Map(parts.flatMap(part => part.segments || []).map(s => [s.speaker, s.label])).entries()];
    const key = JSON.stringify([people, locked]);
    if (speakerBox.dataset.renderKey !== key) {
      speakerBox.dataset.renderKey = key; speakerBox.replaceChildren();
      for (const [speaker, label] of people) {
        const row = document.createElement('label'); row.textContent = label + ' 역할 ';
        const select = document.createElement('select'); select.setAttribute('aria-label', label + ' 역할'); select.disabled = locked;
        for (const role of ['', '선수','멘탈코치','보호자','기타']) {
          const option = document.createElement('option'); option.value = role; option.textContent = role || '미지정'; select.append(option);
        }
        select.value = speakerRoles[speaker] || '';
        select.onchange = () => {
          speakerRoles[speaker] = select.value; rebuild(); summary = null; phase = 'summary-error';
          render('화자 역할을 반영했습니다. 다시 요약을 눌러 확인해주세요.');
        };
        row.append(select); speakerBox.append(row);
      }
    }
    root.setAttribute('aria-busy', String(busy));
  }
  async function call(endpoint, body, contentType, generation) {
    const controller = new AbortController(); request = controller;
    const deadline = setTimeout(() => controller.abort(), 180000);
    try {
      const bearer = await token();
      if (generation !== serial || !same()) throw new DOMException('취소됨','AbortError');
      const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': contentType, Authorization: `Bearer ${bearer}`, 'X-Player-ID': draft.playerId, 'X-Session-ID': draft.sessionId}, body, signal: controller.signal});
      const result = await readApiResponse(response);
      if (generation !== serial || !same()) throw new DOMException('취소됨','AbortError');
      if (!response.ok) {const error = new Error(result.error || '상담 처리에 실패했습니다.'); error.status = response.status; throw error;}
      if (result.playerId !== draft.playerId || result.sessionId !== draft.sessionId) throw new Error('선수와 회차를 다시 확인해주세요.');
      return result;
    } finally {clearTimeout(deadline); if (request === controller) request = null;}
  }
  async function summarize() {
    const generation = serial;
    if (!same() || !transcript || !stopped || processing || parts.some(part => !part.segments)) return;
    phase = 'summarize'; summary = null; render();
    try {
      const result = await call('./api/consultation-summary', JSON.stringify({transcript}), 'application/json', generation);
      summaryText(result.summary); summary = result.summary; phase = 'complete'; render();
    } catch (error) {
      if (generation !== serial) return;
      phase = 'summary-error'; render(error.name === 'AbortError' ? '요약 연결 시간이 초과되었습니다. 다시 요약해주세요.' : apiErrorMessage(error));
    }
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function processQueue() {
    if (processing || !same()) return;
    const generation = serial; processing = true;
    try {
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (part.segments || part.error) continue;
        for (let attempt = 0; attempt < 3; attempt++) {
          // Respect the API's two-second rate limit, including very fast responses.
          await wait(Math.max(0, 2100 - (Date.now() - lastRequest)));
          if (generation !== serial || !same()) return;
          try {
            lastRequest = Date.now();
            const result = await call('./api/transcribe', part.audio, part.audio.type, generation);
            if (typeof result.transcript !== 'string' || !result.transcript.trim()) throw new Error('녹취가 비어 있습니다. 다시 시도해주세요.');
            const segments = Array.isArray(result.segments) ? result.segments.filter(s => typeof s.speaker === 'string' && typeof s.label === 'string' && typeof s.text === 'string') : [];
            part.segments = segments.length ? segments.map(s => ({...s, speaker: `${index}:${s.speaker}`, label: `${index+1}구간 ${s.label}`})) : [{speaker: `${index}:text`, label: `${index+1}구간`, text: result.transcript}];
            rebuild(); render(); break;
          } catch (error) {
            if (generation !== serial) return;
            const transient = !error.status || [408,429,500,502,503,504].includes(error.status);
            if (attempt < 2 && transient) {await wait(2000 * (attempt + 1)); continue;}
            part.error = apiErrorMessage(error); render(); break;
          }
        }
      }
    } finally {
      if (generation === serial) {
        processing = false;
        if (stopped) {
          if (!parts.length) reset('녹음된 음성이 없습니다. 다시 시작해주세요.');
          else if (parts.some(part => !part.segments)) {phase = 'transcription-error'; render();}
          else await summarize();
        }
      }
    }
  }
  async function finish(message = '') {
    if (!microphone || !capturing() || changing) return;
    changing = true; phase = 'upload'; stopMessage = message; clearInterval(timer); render();
    const generation = serial, current = microphone;
    try {await current.stop();}
    catch (error) {if (generation === serial) stopMessage = error.message;}
    if (generation !== serial) return;
    microphone = null; changing = false; stopped = true;
    void wakeLock?.release().catch(() => {}); wakeLock = null;
    render(); void processQueue();
  }
  async function keepAwake(generation) {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    if (wakeLock && !wakeLock.released) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (generation !== serial || !capturing()) {await lock.release(); return;}
      wakeLock = lock;
    } catch {} // Unsupported/denied screen wake lock does not prevent audio capture.
  }
  $('start').onclick = async () => {
    if (active() || !ready() || !context()) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext) || !window.AudioWorkletNode) {
      render('이 브라우저에서는 녹음할 수 없습니다. HTTPS에서 최신 Safari 또는 Chrome을 사용해주세요.'); return;
    }
    draft = Object.freeze({...context(), recordedAt: new Date().toISOString()}); const generation = ++serial;
    phase = 'permission'; render();
    try {
      const acquired = await capture({
        onPart(audio) {if (generation !== serial) return; parts.push({audio, segments: null, error: null}); render(); void processQueue();},
        onLimit() {if (generation === serial) void finish('60분에 도달하여 녹음을 자동 종료했습니다.');},
        onError(error) {if (generation === serial) void finish(error.message);},
      });
      if (generation !== serial || !same()) {acquired.cancel(); return;}
      microphone = acquired; phase = 'recording'; timer = setInterval(() => {
        render(); if (microphone.seconds() >= MAX_SECONDS) void finish('60분에 도달하여 녹음을 자동 종료했습니다.');
      }, 500);
      void keepAwake(generation); render();
    } catch (error) {
      if (generation !== serial) return;
      reset(error.name === 'NotAllowedError' ? '마이크 사용 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.' : error.message || '녹음을 시작할 수 없습니다. 마이크 연결 상태를 확인해주세요.');
    }
  };
  $('pause').onclick = async () => {
    if (!microphone || !capturing() || changing) return;
    const generation = serial; changing = true; render();
    try {
      if (phase === 'recording') {await microphone.pause(); if (generation === serial) phase = 'paused';}
      else {await microphone.resume(); if (generation === serial) phase = 'recording';}
    } catch (error) {if (generation === serial) {changing = false; void finish(error.message);}}
    finally {if (generation === serial) {changing = false; render();}}
  };
  $('stop').onclick = () => {void finish();};
  $('retry').onclick = () => {
    if (phase !== 'transcription-error' || processing) return;
    parts.forEach(part => {part.error = null;}); phase = 'upload'; render(); void processQueue();
  };
  $('resummarize').onclick = () => {if (['complete','summary-error'].includes(phase)) void summarize();};
  $('cancel').onclick = () => reset('녹음을 취소했습니다. 기존 메모는 유지됩니다.');
  if ($('import') && $('file')) {
    $('import').onclick = () => {if (!active() && ready() && context()) $('file').click();};
    $('file').onchange = async () => {
      const file = $('file').files[0]; $('file').value = '';
      if (!file || active() || !ready() || !context()) return;
      draft = Object.freeze({...context(), recordedAt: new Date().toISOString()}); const generation = ++serial;
      phase = 'upload'; render('녹음 원본 확인 중…');
      try {
        const audioParts = await splitRecording(file);
        if (generation !== serial || !same()) return;
        parts = audioParts.map(audio => ({audio, segments: null, error: null})); stopped = true;
        render(); void processQueue();
      } catch (error) {if (generation === serial) reset(error.message);}
    };
  }
  if ($('download')) $('download').onclick = () => {
    if (!parts.length || !same()) return;
    const url = URL.createObjectURL(joinWav(parts.map(part => part.audio)));
    const link = document.createElement('a'); link.href = url; link.download = `상담녹음-${draft.recordedAt.slice(0,10)}.wav`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify(capturing() ? '현재까지 완료된 구간의 음성을 내려받았습니다. 전체 원본은 녹음 종료 후 내려받으세요.' : '상담 녹음 원본을 내려받았습니다.');
  };
  $('insert').onclick = () => {
    if (!same() || !summary || phase !== 'complete') return;
    try {insert(draft, summary, transcript); reset(); notify('상담요약을 기존 메모 뒤에 추가했습니다. 저장 상태를 확인해주세요.');}
    catch (error) {render(error.message);}
  };
  document.addEventListener('visibilitychange', () => {if (capturing() && document.visibilityState === 'visible') void keepAwake(serial);});
  window.addEventListener('pagehide', () => reset());
  return {sync() {if (draft && !same()) reset('선수 또는 회차가 변경되어 녹음과 미리보기를 폐기했습니다.'); else render();}, cancel: reset, active};
}
