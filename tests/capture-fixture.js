// Isolated local browser fixture: real AudioWorklet with synthetic audio, never a user's microphone.
if (location.hostname !== '127.0.0.1' || location.port !== '8790') throw new Error('Loopback fixture only');
const fixtureFlags = {denied: false, transcription: false, summary: false};
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {configurable:true, value:async () => {
  if (fixtureFlags.denied) throw new DOMException('Test permission denied', 'NotAllowedError');
  const sourceContext = new AudioContext();
  const oscillator = sourceContext.createOscillator(), destination = sourceContext.createMediaStreamDestination();
  oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start(); await sourceContext.resume();
  const track = destination.stream.getAudioTracks()[0], stop = track.stop.bind(track);
  track.stop = () => {stop(); oscillator.stop(); void sourceContext.close();};
  return destination.stream;
}});
const fixtureFetch = window.fetch.bind(window);
window.fetch = async (url, options) => {
  if (String(url).endsWith('/api/transcribe') && fixtureFlags.transcription) return new Response(JSON.stringify({error:'검증용 전사 실패'}),{status:401});
  if (String(url).endsWith('/api/consultation-summary') && fixtureFlags.summary) return new Response(JSON.stringify({error:'검증용 요약 실패'}),{status:502});
  return fixtureFetch(url, options);
};
document.addEventListener('DOMContentLoaded', () => {
  const controls = document.createElement('aside'); controls.style.cssText = 'position:fixed;bottom:0;left:0;z-index:10000;background:white;border:1px solid;padding:6px';
  for (const [key, title] of [['denied','마이크 거절 테스트'],['transcription','전사 실패 테스트'],['summary','요약 실패 테스트']]) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.onchange = () => {fixtureFlags[key] = input.checked;}; label.append(input,title); controls.append(label);
  }
  document.body.append(controls);
});
