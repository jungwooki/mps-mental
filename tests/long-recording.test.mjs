import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRecording} from '../recording.js';
import {wavHeader, joinWav, splitRecording, startCapture, SAMPLE_RATE, PART_SECONDS, MAX_SECONDS} from '../audio-capture.js';

const workletSource = await readFile(new URL('../pcm-worklet.js', import.meta.url), 'utf8');
function processor(rate, maxFrames) {
  let Worklet, messages = [], captured = 0, minimum = Infinity, maximum = -Infinity;
  const scope = {
    sampleRate: rate, registerProcessor(name, constructor) {Worklet = constructor;},
    AudioWorkletProcessor: class {constructor() {this.port = {postMessage(data) {
      if (data.type === 'pcm') {
        captured += data.pcm.length;
        for (const sample of data.pcm) {minimum = Math.min(minimum, sample); maximum = Math.max(maximum, sample);}
      } else messages.push(data);
    }};}},
  };
  vm.runInNewContext(workletSource, scope);
  const instance = new Worklet({processorOptions: {maxFrames}});
  return {instance, command: type => instance.port.onmessage({data: {type, id: type}}),
    counts: () => ({captured, minimum, maximum, messages})};
}

test('audio thread captures exactly 60 minutes, stops itself, and excludes pauses', () => {
  const p = processor(48000, SAMPLE_RATE * MAX_SECONDS);
  const input = new Float32Array(48000).fill(0.25);
  p.command('resume');
  for (let second = 0; second < MAX_SECONDS; second++) {
    if (second === 123) {
      p.command('pause'); for (let i = 0; i < 10; i++) p.instance.process([[input]]);
      p.command('resume');
    }
    p.instance.process([[input]]);
  }
  p.instance.process([[input]]);
  assert.equal(p.counts().captured, 57600000);
  assert.equal(p.counts().messages.filter(m => m.type === 'limit').length, 1);
  assert.equal(p.counts().minimum, 8192);
  assert.equal(p.counts().maximum, 8192);
});

test('44.1kHz stereo is downmixed/resampled and the final partial buffer is flushed', () => {
  const p = processor(44100, SAMPLE_RATE * MAX_SECONDS);
  const a = new Float32Array(128).fill(0.6), b = new Float32Array(128).fill(0.2);
  p.command('resume');
  for (let i = 0; i < 1000; i++) p.instance.process([[a, b]]);
  p.command('stop');
  assert.equal(p.counts().captured, Math.floor(128000 / 44100 * SAMPLE_RATE));
  assert.equal(p.counts().minimum, 13107);
  assert.equal(p.counts().maximum, 13107);
});

test('WAV chunks fit the platform limit and joining retains all PCM bytes', async () => {
  const frames = PART_SECONDS * SAMPLE_RATE, samples = new Uint8Array(frames * 2).fill(23);
  const audio = new Blob([wavHeader(frames), samples], {type: 'audio/wav'});
  assert.equal(audio.size, 2880044);
  assert.ok(audio.size < 4500000);
  const joined = joinWav([audio, audio]);
  const bytes = await joined.arrayBuffer(), header = new DataView(bytes);
  assert.equal(joined.size, samples.length * 2 + 44);
  assert.equal(header.getUint32(40, true), samples.length * 2);
  assert.equal(header.getUint32(24, true), 16000);
  assert.equal(new Uint8Array(bytes).at(-1), 23);
});

test('saved original can be imported in bounded parts, including a final short part', async () => {
  const frames = SAMPLE_RATE * 181;
  const original = new Blob([wavHeader(frames), new Uint8Array(frames * 2)]);
  const parts = await splitRecording(original);
  assert.deepEqual(parts.map(p => p.size), [2880044,2880044,32044]);
  assert.equal(joinWav(parts).size, original.size);
  await assert.rejects(() => splitRecording(new Blob(['invalid'])), /WAV/);
  const overLimit = new Blob([wavHeader(SAMPLE_RATE * (MAX_SECONDS + 1)), new Uint8Array(SAMPLE_RATE * (MAX_SECONDS + 1) * 2)]);
  await assert.rejects(() => splitRecording(overLimit), /60분/);
});

test('capture adapter creates 40 WAV chunks without lost/duplicated samples', async () => {
  let node, stopped = false, closed = false;
  const sizes = [];
  globalThis.window = {AudioContext:class {
    constructor() {this.audioWorklet = {addModule:async()=>{}}; this.state = 'running';}
    createMediaStreamSource() {return {connect() {},disconnect() {}};}
    async resume() {} async close() {closed = true;}
  }};
  globalThis.AudioWorkletNode = class {
    constructor() {node = this; this.port = {postMessage:data => queueMicrotask(() => this.port.onmessage({data:{type:'ack',id:data.id}}))};}
    connect() {} disconnect() {}
  };
  Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{readyState:'live',stop() {stopped=true;}}]})}}});
  const mic = await startCapture({onPart:audio=>sizes.push(audio.size),onLimit() {},onError:error=>{throw error;}});
  const pcm = new Int16Array(4096).fill(777);
  let remaining = MAX_SECONDS * SAMPLE_RATE;
  while (remaining) {
    const current = pcm.subarray(0,Math.min(remaining,pcm.length)); remaining -= current.length;
    node.port.onmessage({data:{type:'pcm',pcm:current}});
  }
  await mic.pause(); await mic.resume(); await mic.stop();
  assert.equal(mic.seconds(),3600);
  assert.equal(sizes.length,40);
  assert.ok(sizes.every(size => size === 2880044));
  assert.equal(stopped,true); assert.equal(closed,true);
});

class Element {
  constructor() {this.hidden = false; this.disabled = false; this.dataset = {}; this.children = []; this.textContent = '';}
  setAttribute() {}
  append(element) {this.children.push(element);}
  replaceChildren() {this.children = [];}
}
const summary = {issues:['실수 후 집중 저하'],selfAwareness:[],gameTraining:[],coaching:['호흡 루틴'],followUp:['루틴 확인']};
const realSetTimeout = globalThis.setTimeout;
function fixture({transcription, summarization, permission, captureStop} = {}) {
  const elements = Object.fromEntries(['start','pause','stop','retry','cancel','download','status','preview','transcript','summary','insert','resummarize','speakers'].map(name => [name, new Element()]));
  const root = {querySelector: selector => elements[selector.match(/"(.*?)"/)[1]], setAttribute() {}};
  let binding = {playerId:'p1',sessionId:'s1',uid:'coach'}, callbacks, canceled = 0, seconds = 0;
  const calls = [], inserted = [];
  globalThis.window = {isSecureContext:true, AudioContext:class {}, AudioWorkletNode:class {}, addEventListener() {}};
  globalThis.document = {visibilityState:'visible', createElement: () => new Element(), addEventListener() {}};
  Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{mediaDevices:{getUserMedia() {}}}});
  globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};
  globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms < 10000 ? 0 : ms, ...args);
  globalThis.fetch = async (endpoint, options) => {
    calls.push({endpoint,options});
    const isSTT = endpoint.endsWith('/transcribe');
    const custom = await (isSTT ? transcription?.(calls.filter(c => c.endpoint.endsWith('/transcribe')).length, options) : summarization?.(options));
    if (custom) return custom;
    return new Response(JSON.stringify({...binding, ...(isSTT ? {transcript:'호흡 루틴을 연습합니다.',segments:[{speaker:'A',label:'화자 1',text:'호흡 루틴을 연습합니다.'}]} : {summary})}), {status:200});
  };
  const recording = createRecording({root, context:() => binding, token:async()=>'fixture', ready:()=>true, notify() {},
    insert:(bound, value, text) => inserted.push({bound,value,text}),
    capture:async cb => {
      callbacks = cb; await permission?.();
      return {seconds:()=>seconds, pause:async()=>{},resume:async()=>{},cancel() {canceled++;},
        stop:async() => {await captureStop?.();}};
    },
  });
  return {elements,recording,calls,inserted, callbacks:()=>callbacks,canceled:()=>canceled,
    switchSession() {binding = {...binding,sessionId:'s2'}; recording.sync();},
    emit() {seconds += 90; callbacks.onPart(new Blob([wavHeader(16),new Uint8Array(32)],{type:'audio/wav'}));},
    start:async()=>elements.start.onclick(), stop:async()=>{await elements.stop.onclick();},
  };
}
async function until(check) {
  for (let i = 0; i < 1000; i++) {if (check()) return; await new Promise(resolve => realSetTimeout(resolve, 1));}
  assert.fail('Recording did not reach expected state');
}

test('40 chunks finish in order; summary waits for stop; speakers stay distinct; insertion is explicit', async () => {
  const f = fixture(); await f.start();
  for (let i = 0; i < 40; i++) f.emit();
  await until(() => f.calls.length === 40);
  assert.equal(f.calls.filter(c => c.endpoint.endsWith('consultation-summary')).length, 0);
  assert.equal(f.inserted.length, 0);
  await f.stop(); await until(() => !f.elements.insert.hidden);
  assert.equal(f.calls.length, 41);
  assert.ok(f.elements.transcript.textContent.includes('40구간 화자 1'));
  assert.equal(f.elements.speakers.children.length, 40);
  assert.equal(f.elements.status.textContent, '완료 · 내용을 확인하고 메모에 삽입하세요.');
  f.elements.insert.onclick(); assert.equal(f.inserted.length, 1);
  assert.equal(f.elements.transcript.textContent, '');
});

test('failed chunk retries automatically; manual retry leaves successful chunks alone', async () => {
  let failures = true;
  const f = fixture({transcription:async n => failures && n <= 3 ? new Response(JSON.stringify({error:'temporary'}),{status:502}) : null});
  await f.start(); f.emit(); f.emit(); await f.stop();
  await until(() => !f.elements.retry.hidden);
  assert.equal(f.calls.length, 4);
  assert.ok(f.elements.transcript.textContent.includes('2구간'));
  assert.equal(f.elements.download.hidden, false);
  failures = false; f.elements.retry.onclick(); await until(() => !f.elements.insert.hidden);
  assert.equal(f.calls.filter(c => c.endpoint.endsWith('/transcribe')).length, 5);
  assert.ok(f.elements.transcript.textContent.indexOf('1구간') < f.elements.transcript.textContent.indexOf('2구간'));
});

test('auth errors are not retried automatically and summary failure retains the transcript', async () => {
  const f = fixture({transcription:async()=>new Response(JSON.stringify({error:'로그인 필요'}),{status:401})});
  await f.start(); f.emit(); await f.stop(); await until(() => !f.elements.retry.hidden);
  assert.equal(f.calls.length,1);
  let failed = true;
  const s = fixture({summarization:async()=>failed ? new Response(JSON.stringify({error:'요약 실패'}),{status:502}) : null});
  await s.start(); s.emit(); await s.stop(); await until(() => s.elements.status.textContent.includes('요약 실패'));
  assert.ok(s.elements.transcript.textContent.includes('호흡'));
  failed = false; s.elements.resummarize.onclick(); await until(() => !s.elements.insert.hidden);
  assert.equal(s.calls.filter(c => c.endpoint.endsWith('/transcribe')).length,1);
});

test('session switch discards delayed responses and releases a delayed microphone', async () => {
  let resolve;
  const f = fixture({permission:() => new Promise(r => {resolve = r;})});
  const starting = f.start(); f.switchSession(); resolve(); await starting;
  assert.equal(f.canceled(),1); assert.equal(f.calls.length,0);
  let respond;
  const s = fixture({transcription:() => new Promise(r => {respond = r;})});
  await s.start(); s.emit(); await until(() => !!respond);
  s.switchSession(); respond(new Response(JSON.stringify({playerId:'p1',sessionId:'s1',transcript:'discard me'}),{status:200}));
  await new Promise(r => realSetTimeout(r,10));
  assert.equal(s.elements.transcript.textContent,''); assert.equal(s.inserted.length,0);
});

test('60 minute limit and microphone interruptions retain captured audio', async () => {
  const f = fixture(); await f.start(); f.emit(); f.callbacks().onLimit();
  await until(() => !f.elements.insert.hidden);
  assert.ok(f.elements.status.textContent.includes('60분')); assert.equal(f.elements.download.hidden,false);
  const s = fixture(); await s.start(); s.emit(); s.callbacks().onError(new Error('마이크 연결 끊김'));
  await until(() => !s.elements.insert.hidden);
  assert.ok(s.elements.status.textContent.includes('마이크 연결 끊김'));
});
