export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 60 * 60;
export const PART_SECONDS = 90;

export function wavHeader(frames) {
  const header = new ArrayBuffer(44), view = new DataView(header);
  const word = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); word(8, 'WAVE');
  word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, frames * 2, true);
  return header;
}

export function joinWav(parts) {
  const frames = parts.reduce((total, blob) => total + (blob.size - 44) / 2, 0);
  return new Blob([wavHeader(frames), ...parts.map(blob => blob.slice(44))], {type: 'audio/wav'});
}

export async function splitRecording(file) {
  const header = new DataView(await file.slice(0, 44).arrayBuffer());
  const word = offset => String.fromCharCode(...new Uint8Array(header.buffer, offset, 4));
  if (header.byteLength !== 44 || word(0) !== 'RIFF' || word(8) !== 'WAVE' || word(12) !== 'fmt ' || word(36) !== 'data'
      || header.getUint32(16, true) !== 16 || header.getUint16(20, true) !== 1 || header.getUint16(22, true) !== 1
      || header.getUint32(24, true) !== SAMPLE_RATE || header.getUint16(34, true) !== 16
      || header.getUint32(40, true) !== file.size - 44 || (file.size - 44) % 2
      || file.size <= 44 || file.size > 44 + MAX_SECONDS * SAMPLE_RATE * 2) {
    throw new Error('이 화면에서 내려받은 60분 이내의 WAV 녹음 원본을 선택해주세요.');
  }
  const parts = [], bytes = PART_SECONDS * SAMPLE_RATE * 2;
  for (let offset = 44; offset < file.size; offset += bytes) {
    const pcm = file.slice(offset, Math.min(offset + bytes, file.size));
    parts.push(new Blob([wavHeader(pcm.size / 2), pcm], {type: 'audio/wav'}));
  }
  return parts;
}

export async function startCapture({onPart, onLimit, onError}) {
  const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}});
  let context, node, source, frames = 0, pending = [], pendingFrames = 0, closed = false, commandId = 0;
  const acknowledgements = new Map();
  const emit = () => {
    if (!pendingFrames) return;
    // Explicit little-endian encoding is required by WAV.
    onPart(new Blob([wavHeader(pendingFrames), ...pending], {type: 'audio/wav'}));
    pending = []; pendingFrames = 0;
  };
  function receive(pcm) {
    let offset = 0;
    while (offset < pcm.length) {
      const count = Math.min(pcm.length - offset, PART_SECONDS * SAMPLE_RATE - pendingFrames);
      const bytes = new ArrayBuffer(count * 2), view = new DataView(bytes);
      for (let i = 0; i < count; i++) view.setInt16(i * 2, pcm[offset + i], true);
      pending.push(bytes); pendingFrames += count; frames += count; offset += count;
      if (pendingFrames === PART_SECONDS * SAMPLE_RATE) emit();
    }
  }
  const release = () => {
    if (closed) return;
    closed = true;
    stream.getTracks().forEach(track => {track.onended = null; track.stop();});
    source?.disconnect(); node?.disconnect();
    if (context) {context.onstatechange = null; void context.close().catch(() => {});}
  };
  function command(type) {
    return new Promise((resolve, reject) => {
      const id = ++commandId;
      const deadline = setTimeout(() => {acknowledgements.delete(id); reject(new Error('마이크 응답이 중단되었습니다. 녹음 원본을 내려받아 확인해주세요.'));}, 3000);
      acknowledgements.set(id, () => {clearTimeout(deadline); resolve();});
      node.port.postMessage({type, id});
    });
  }
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    context = new Audio();
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
    if (stream.getTracks().some(track => track.readyState === 'ended')) throw new Error('마이크 연결이 끊어졌습니다.');
    node = new AudioWorkletNode(context, 'consultation-pcm', {processorOptions: {maxFrames: MAX_SECONDS * SAMPLE_RATE}});
    node.port.onmessage = ({data}) => {
      if (closed) return;
      if (data.type === 'pcm') receive(data.pcm);
      if (data.type === 'ack') {acknowledgements.get(data.id)?.(); acknowledgements.delete(data.id);}
      if (data.type === 'limit') onLimit();
    };
    node.onprocessorerror = () => onError(new Error('녹음 처리가 중단되었습니다. 확보된 음성을 확인해주세요.'));
    source = context.createMediaStreamSource(stream);
    source.connect(node); node.connect(context.destination); // Worklet output is silence; no microphone playback.
    await context.resume();
    if (context.state !== 'running') throw new Error('마이크를 시작하지 못했습니다. 다시 녹음 버튼을 눌러주세요.');
    await command('resume');
    stream.getTracks().forEach(track => {track.onended = () => onError(new Error('마이크 연결이 끊어져 녹음을 종료합니다. 확보된 음성은 유지됩니다.'));});
    context.onstatechange = () => {if (!closed && context.state !== 'running') onError(new Error('기기가 녹음을 중단했습니다. 확보된 음성을 확인해주세요.'));};
    return {
      seconds: () => frames / SAMPLE_RATE,
      async pause() {await command('pause');},
      async resume() {await command('resume');},
      async stop() {
        try {await command('stop');} finally {emit(); release();}
      },
      cancel() {release(); pending = []; pendingFrames = 0;},
    };
  } catch (error) {release(); throw error;}
}
