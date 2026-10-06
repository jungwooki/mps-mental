import assert from 'node:assert/strict';
import { readApiResponse } from '../api.js';
assert.deepEqual(await readApiResponse(new Response('{"text":"요약"}')),{text:'요약'});
assert.deepEqual(await readApiResponse(new Response('{"error":"다시 시도"}',{status:502})),{error:'다시 시도'});
for(const body of ['', '  ', '<html>private consultation</html>', '{"text":', 'null', '[]', '"text"']) {
  await assert.rejects(readApiResponse(new Response(body)),error=>error.name==='ApiResponseError' && !error.message.includes('private consultation') && !error.message.includes('JSON'));
}
await assert.rejects(readApiResponse(new Response('',{status:401})),/다시 로그인/);
await assert.rejects(readApiResponse(new Response('',{status:429})),/잠시 후/);
await assert.rejects(readApiResponse(new Response(null,{status:204})),/응답이 비어/);
const aborted={text:async()=>{throw new DOMException('cancelled','AbortError')}};
await assert.rejects(readApiResponse(aborted),error=>error.name==='AbortError');
console.log('PASS: valid JSON, empty/truncated/non-JSON responses, HTTP errors and cancellation');
const {apiErrorMessage}=await import('../api.js');
assert.ok(apiErrorMessage(new SyntaxError("Failed to execute 'json' on 'Response': Unexpected end of JSON input")).includes('응답이 비어'));
assert.ok(apiErrorMessage(new TypeError('Failed to fetch')).includes('인터넷 연결'));
assert.equal(apiErrorMessage(new Error('다시 요약해주세요.')),'다시 요약해주세요.');
