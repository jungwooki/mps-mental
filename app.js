import {profileFor,recentDiary,deleteNote,DIARY_ACTIONS,MOODS,diaryRows,validateDiaryBackup,mergeDiaryRecords,growthIdentity} from './coach-dashboard.js';
import {reportTypes,stageReference} from './report-reference.js';
import {findEnrolledPlayer, filterReportRoster, reportEnrollmentFields} from './report-enrollment.js';
import { readApiResponse, apiErrorMessage } from './api.js';
import { firebaseConfig, summaryEndpoint, healthEndpoint, loginAliases } from './config.js';
import { createRecording, appendSummary } from './recording.js';
import { chartFields, orderedSessions, completedSessions, latestFourInput } from './core.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const KEY = 'mps-mental-v1';
const collections = { players: 'mental_players', sessions: 'mental_sessions', summaries: 'mental_summaries' };
const fields = chartFields;
let state = { players: {}, sessions: {}, summaries: {}, pending: {} };
let playerId = new URLSearchParams(location.search).get('player') || '', sessionId = '';
let authTools, stopAuthWatcher, changingAccount = false, coachClaims = {};
let db, sdk, auth, syncing = false, cloudReady = false, storageOK = true, editingPlayer = '';
let saveTimer, aiTimer, toastTimer, aiReady = false, aiBusy = false;
let generationSerial = 0;
let expandedSessionId = '';
let connecting = false, listeners = [];
let reportRoster = {}, selectedReportSource = '', reportFocusPlayer = '';
const serverSeen = new Set();

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function cache() {
  try { localStorage.setItem(KEY, JSON.stringify({...state,cacheUid:auth?.currentUser?.uid || ''})); storageOK = true; }
  catch { storageOK = false; toast('기기 임시 저장 공간이 부족합니다. 저장소 연결 상태를 확인하세요.'); }
}
function refreshCompletionDots() {
  document.querySelectorAll('[data-completion-session]').forEach(dot=>{
    const id=dot.dataset.completionSession;
    dot.hidden=!state.sessions[id]?.completedAt || !!state.pending[`sessions/${id}`]?.data.completedAt;
  });
}
function cloudStatus(error) {
  refreshCompletionDots();
  const count = Object.keys(state.pending).length;
  const el = $('cloud-status'); el.classList.remove('cloud-good','cloud-error');
  if (error) { el.textContent = error; el.classList.add('cloud-error'); }
  else if (!navigator.onLine) { el.textContent = `오프라인 · ${count}건 서버 저장 대기`; el.classList.add('cloud-error'); }
  else if (!cloudReady) el.textContent = 'Firebase 연결 중 · 기기에 임시 저장';
  else if (count) el.textContent = `${count}건 서버 저장 중…`;
  else { el.textContent = '저장 완료'; el.classList.add('cloud-good'); }
  if (!storageOK) { el.textContent += ' · 기기 임시 저장 실패'; el.classList.add('cloud-error'); }
  $('session-save-status').textContent = count ? '변경 사항을 서버에 저장 중입니다.' : cloudReady ? '변경사항이 저장되었습니다.' : '기기에 임시 저장 · 서버 연결 대기';
}
function write(kind, id, patch) {
  if (!auth?.currentUser || auth.currentUser.isAnonymous || coachClaims.mentalCoach !== true) return toast('로그인 후 사용할 수 있습니다.');
  const value = {...patch, id, updatedAt: new Date().toISOString()};
  state[kind][id] = {...state[kind][id], ...value};
  const key = `${kind}/${id}`;
  state.pending[key] = { kind, id, data: {...state.pending[key]?.data, ...value}, revision: crypto.randomUUID() };
  cache(); cloudStatus(); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 650);
  if (kind !== 'summaries') scheduleAI();
}
async function flush() {
  if (!db || !cloudReady || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const key of Object.keys(state.pending)) {
      const item = state.pending[key];
      if (!item) continue;
      await sdk.setDoc(sdk.doc(db, collections[item.kind], item.id), item.data, { merge: true });
      if (state.pending[key]?.revision === item.revision) delete state.pending[key];
      cache(); cloudStatus();
    }
  } catch (error) {
    cloudStatus(error.code === 'permission-denied' ? '저장 권한 오류 · 기기에 임시 저장됨' : '서버 저장 실패 · 재시도 필요');
    console.error('Firebase save:', error.code || error.message);
  } finally {
    syncing = false;
    if (Object.keys(state.pending).length && cloudReady && navigator.onLine) {
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 8000);
    }
    scheduleAI();
  }
}
async function connect() {
  if(connecting)return;
  connecting=true;
  for(const stop of listeners)stop();listeners=[];serverSeen.clear();cloudReady=false;
  try {
    const base = 'https://www.gstatic.com/firebasejs/11.6.1/';
    const [appSDK, authSDK, firestoreSDK] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
    ]);
    sdk = firestoreSDK;
    const app = appSDK.getApps()[0] || appSDK.initializeApp(firebaseConfig);
    authTools = authSDK; auth = authSDK.getAuth(app); db = sdk.getFirestore(app);
    await auth.authStateReady();
    if (!auth.currentUser || auth.currentUser.isAnonymous) {setLoginGate(true,$('coach-login-status').textContent === '로그인 중…' ? '' : $('coach-login-status').textContent);return;}
    coachClaims = (await auth.currentUser.getIdTokenResult(true)).claims;
    if (coachClaims.mentalCoach !== true) {setLoginGate(true,'사용 권한이 없는 계정입니다. 관리자에게 문의해주세요.');return;}
    setLoginGate(false);showView();
    try {
      const loaded=JSON.parse(localStorage.getItem(KEY) || 'null');
      if (loaded && (loaded.cacheUid === auth.currentUser.uid || (!loaded.cacheUid && auth.currentUser.isAnonymous)) && ['players','sessions','summaries','pending'].every(k=>loaded[k] && typeof loaded[k]==='object' && !Array.isArray(loaded[k]))) state=loaded;
    } catch {toast('기기 임시 기록을 읽을 수 없습니다. 서버 기록을 불러옵니다.');}

    if (coachClaims.mentalCoach !== true || coachClaims.mentalAdmin !== true) {
      const allowed=coachClaims.mentalCoach === true && Array.isArray(coachClaims.mentalPlayerIds) ? coachClaims.mentalPlayerIds : [];
      if (!auth.currentUser.isAnonymous) {
        state.players=Object.fromEntries(Object.entries(state.players).filter(([id])=>allowed.includes(id)));
        for(const kind of ['sessions','summaries'])state[kind]=Object.fromEntries(Object.entries(state[kind]).filter(([,v])=>allowed.includes(v.playerId)));
        state.pending=Object.fromEntries(Object.entries(state.pending).filter(([,v])=>allowed.includes(v.kind==='players' ? v.id : v.data.playerId || state[v.kind][v.id]?.playerId)));
      }
    }
    $('coach-account').textContent = auth.currentUser.isAnonymous ? '코치 로그인' : '코치 계정';
    $('coach-logout').hidden = auth.currentUser.isAnonymous;
    recording.sync();
    stopAuthWatcher?.();
    const connectedUid=auth.currentUser.uid;
    stopAuthWatcher=authSDK.onAuthStateChanged(auth,user=>{
      if(changingAccount || connecting || user?.uid === connectedUid)return;
      recording.cancel();generationSerial++;clearTimeout(aiTimer);
      for(const stop of listeners)stop();listeners=[];
      state={players:{},sessions:{},summaries:{},pending:{}};playerId='';sessionId='';coachClaims={};cloudReady=false;
      localStorage.removeItem(KEY);renderPlayers();renderChart(true);connect();
    });
    for (const [kind, collectionName] of Object.entries(collections)) {
      const allowed = coachClaims.mentalCoach === true && Array.isArray(coachClaims.mentalPlayerIds) ? coachClaims.mentalPlayerIds : [];
      const restricted = !auth.currentUser.isAnonymous && !(coachClaims.mentalCoach === true && coachClaims.mentalAdmin === true);
      const sources = restricted ? Array.from({length:Math.ceil(allowed.length/30)},(_,i)=>sdk.query(sdk.collection(db,collectionName),sdk.where(kind === 'players' ? sdk.documentId() : 'playerId','in',allowed.slice(i*30,i*30+30)))) : [sdk.collection(db,collectionName)];
      if (!sources.length) {state[kind]={};serverSeen.add(kind);cloudReady=serverSeen.size===Object.keys(collections).length;continue;}
      const sourceData = new Map(), confirmed = new Set();
      for (const [sourceIndex, source] of sources.entries()) listeners.push(sdk.onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
        const next = {};
        snapshot.forEach(doc => { next[doc.id] = doc.data(); });
        sourceData.set(sourceIndex,{...next});
        Object.assign(next,...[...sourceData].filter(([index])=>index!==sourceIndex).map(([,data])=>data));
        for (const item of Object.values(state.pending)) {
          if (item.kind === kind) next[item.id] = {...next[item.id], ...item.data};
        }
        // Preserve the device cache until the first server-confirmed snapshot.
        state[kind] = snapshot.metadata.fromCache ? {...state[kind], ...next} : next;
        if (!snapshot.metadata.fromCache) confirmed.add(sourceIndex);
        if (confirmed.size === sources.length) serverSeen.add(kind);
        cloudReady = serverSeen.size === Object.keys(collections).length;
        cache(); renderPlayers(); renderChart(false); cloudStatus();
        if (cloudReady) { flush(); scheduleAI(); }
      }, error => {
        cloudReady = false; cloudStatus('데이터 조회 실패 · Firebase 권한 확인 필요');
        console.error('Firebase read:', error.code || error.message);
      }));
    }
    renderPlayers();renderChart(false);cloudStatus();
  } catch (error) {
    cloudReady = false; cloudStatus('Firebase 연결 실패 · 기기에 임시 저장');
    console.error('Firebase connection:', error.code || error.message);
    if (document.body.classList.contains('auth-locked')) setLoginGate(true,'로그인 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  } finally {connecting=false;}
}
function allPlayers(deleted=false) { return Object.values(state.players).filter(p=>!!p.deletedAt===deleted).filter(p=>p.source!=='2026mental2'||p.managed===true).sort((a,b) => a.name.localeCompare(b.name, 'ko')); }
function playerCode(p) { return p.number || `ID-${p.id.slice(0,8)}`; }
function playerLabel(p) { return `${p.name} · ${playerCode(p)} · ${p.organization || '소속 미등록'}`; }
function sessions(id = playerId) {
  return orderedSessions(state.sessions,id);
}
function recorded(id = playerId) {
  return completedSessions(state.sessions,id);
}
function renderWorkspacePlayers(){
 const q=$('workspace-player-search').value.trim().toLocaleLowerCase();
 const players=allPlayers().filter(p=>`${p.name} ${playerCode(p)} ${p.organization||''}`.toLocaleLowerCase().includes(q));
 $('workspace-player-count').textContent=String(players.length);
 $('workspace-player-list').innerHTML=players.map(p=>`<button type="button" class="athlete-choice" data-chart-athlete="${esc(p.id)}" aria-current="${p.id===playerId}"><span><b>${esc(p.name)}</b><small>${esc(playerCode(p))}</small></span><span class="athlete-choice-meta">${esc(p.organization||'소속 미등록')}<small>${sessions(p.id).length}회</small></span></button>`).join('')||'<p class="rail-empty">검색된 선수가 없습니다.</p>';
 $('workspace-player-list').querySelectorAll('[data-chart-athlete]').forEach(b=>b.onclick=()=>selectPlayer(b.dataset.chartAthlete));
}
$('workspace-player-search').addEventListener('input',renderWorkspacePlayers);
function renderPlayers() {
  renderWorkspacePlayers();
  document.querySelectorAll('[data-add-player]').forEach(b=>b.disabled=!!auth?.currentUser && !auth.currentUser.isAnonymous && !(coachClaims.mentalCoach === true && coachClaims.mentalAdmin === true));
  const q = $('player-search').value.toLowerCase(), coach = $('coach-filter').value, filter = $('player-filter').value;
  const list = allPlayers(filter==='deleted').filter(p => `${p.name} ${p.number || ''} ${p.id} ${p.program} ${p.organization || ''}`.toLowerCase().includes(q) && (p.coach || '').includes(coach) && (filter === 'deleted' || filter === 'all' || (filter === 'active') === p.active));
  $('player-rows').innerHTML = list.map(p => `<tr class="${p.id === playerId ? 'selected-player' : ''}"><td><button class="row-link" ${p.deletedAt?'disabled':''} data-player="${esc(p.id)}" aria-label="${esc(playerLabel(p))} 차팅 열기">${esc(p.name)} →</button><small class="player-code" title="선수 ID: ${esc(p.id)}">${esc(playerCode(p))}${p.id === playerId ? ' · 현재 선택' : ''}</small></td><td><span class="player-state ${p.active ? 'active' : 'inactive'}">${p.deletedAt ? '삭제됨' : p.active ? '활성' : '비활성'}</span>${p.deletedAt?`<small class="player-code">${esc(new Date(p.deletedAt).toLocaleString('ko-KR'))}</small>`:''}</td><td>${esc(p.program || '미등록')}</td><td>${esc(p.organization || '미등록')}</td><td>${esc(p.coach || '담당 미지정')}</td><td>${p.deletedAt?`<button class="button" data-restore-player="${esc(p.id)}">복원</button>`:`<button class="text-link" data-edit="${esc(p.id)}">수정</button> <button class="button subtle-danger" data-delete-player="${esc(p.id)}">삭제</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">등록된 선수가 없습니다. 선수 등록으로 시작하세요.</td></tr>';
  $('player-rows').querySelectorAll('[data-player]').forEach(b => b.onclick = () => selectPlayer(b.dataset.player));
  $('player-rows').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openPlayer(b.dataset.edit));
  $('player-rows').querySelectorAll('[data-delete-player],[data-restore-player]').forEach(b=>{b.disabled=coachClaims.mentalAdmin!==true;b.onclick=()=>changePlayerDeletion(b.dataset.deletePlayer||b.dataset.restorePlayer,!!b.dataset.deletePlayer);});
  $('chart-player').innerHTML = '<option value="">선수 선택</option>' + allPlayers().map(p => `<option value="${esc(p.id)}">${esc(playerLabel(p))}${p.active ? '' : ' · 비활성'}</option>`).join('');
  $('chart-player').value = playerId;
  $('mental-stats').innerHTML = [['관리 선수',allPlayers().length],['활성 선수',allPlayers().filter(p=>p.active).length],['기록된 회차',Object.values(state.sessions).filter(s=>!s.deletedAt&&allPlayers().some(p=>p.id===s.playerId)&&(s.note || s.topic || s.assessment || s.diary || s.next || s.question)).length],['담당 코치',new Set(allPlayers().map(p=>p.coach).filter(Boolean)).size]].map(([label,value])=>`<article><span class="tiny">${label}</span><b>${value}</b></article>`).join('');
  $('weekly-list').innerHTML = allPlayers().filter(p=>recorded(p.id).length).map(p=>`<button class="button" data-player="${esc(p.id)}">${esc(playerLabel(p))} · ${recorded(p.id).length}회</button>`).join('') || '<p class="muted">첫 회차를 기록하면 주간 미팅 목록에 표시됩니다.</p>';
  $('weekly-list').querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>selectPlayer(b.dataset.player));
  $('data-status').textContent = '선수명을 누르면 상담 준비 화면이 열립니다. 입력한 기록은 자동 저장됩니다.';
}
function selectPlayer(id, view = 'chart') {
  if(state.players[id]?.deletedAt)return;
  playerId = id; sessionId = sessions().at(-1)?.id || ''; expandedSessionId=sessionId;
  const url = new URL(location.href); id ? url.searchParams.set('player',id) : url.searchParams.delete('player');
  url.hash = view; history.replaceState(null,'',url);
  renderChart(true); renderPlayers(); showView(); setCoachingStep('prepare'); $('finish-feedback').textContent=''; scheduleAI();
}
function safeUrl(url) { if(typeof url !== 'string' || !url.trim())return '';try { const u = new URL(url, location.href); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
let profileKey='', stopProfile=null, profileReports=[], profileStatus='', diaryRenderKey='';
function renderGrowthIdentity(profile){
 const slot=$('player-growth-identity');if(!slot)return;
 const g=growthIdentity(profile?.record?.growth);
 const kindClass={'지연성장':'growth-delayed','평균성장':'growth-average','조기성장':'growth-early'}[g.kind]||'growth-unknown';
 const difference=g.difference==='차이 미확인'?g.difference:`차이 ${g.difference}`;
 slot.innerHTML=`<span class="growth-chip growth-stage ${g.stage.includes('미확인')?'growth-unknown':''}">${esc(g.stage)}</span><span>뼈나이 ${esc(g.bone)}</span><span>생활나이 ${esc(g.chronological)}</span><span class="growth-chip growth-difference ${g.difference.includes('미확인')?'growth-unknown':''}" title="뼈나이 − 생활나이">${esc(difference)}</span><b class="growth-chip growth-kind ${kindClass}" title="기존 지연 기준 −6개월에 맞춘 화면 구분: −6개월 이하 지연, +6개월 이상 조기, 그 사이 평균">${esc(g.kind)}</b>`;
}
function renderCoachPanels(p){
 const source=p?.reportSourcePlayerId || (p?.source==='2026mental2'?p.id:'');
 const key=p?`${auth?.currentUser?.uid||''}:${coachClaims.mentalAdmin?(source?'admin-reports':'no-report'):`${p.id}:${source}`}`:'';
 if(key!==profileKey){stopProfile?.();stopProfile=null;profileKey=key;profileReports=[];profileStatus=source?'검사 정보를 불러오는 중입니다…':'연결된 검사 기록이 없습니다. 선수 정보 수정에서 리포트를 연결하세요.';diaryRenderKey='';
  if(source&&sdk&&db&&coachAuthorized(p.id)){
   const scope=coachClaims.mentalAdmin?sdk.collection(db,'mental_reports'):sdk.query(sdk.collection(db,'mental_reports'),sdk.where('playerId','==',source));
   stopProfile=sdk.onSnapshot(scope,{includeMetadataChanges:true},snap=>{if(profileKey!==key)return;profileReports=[];snap.forEach(d=>profileReports.push({...d.data(),id:d.id}));profileStatus='해당 선수의 검사 기록이 없습니다.';renderCoachPanels(state.players[playerId]);},()=>{if(profileKey===key){profileStatus='검사 정보를 불러오지 못했습니다. 권한과 연결 상태를 확인하세요.';renderCoachPanels(state.players[playerId]);}});
  }
 }
 $('coach-profile').hidden=!p;$('coach-diary').hidden=!p;if(!p)return;
 const profile=profileFor(profileReports,source,coachClaims.mentalAdmin?{}:stageReference);
 renderGrowthIdentity(profile);
 const bar=m=>`<div class="coach-metric ${m.delta!==null&&m.delta<=-.3?'focus':m.delta!==null&&m.delta>=.3?'strength':''}"><div class="metric-label"><span>${esc(m.name)}</span><b>${m.value===null?'미측정':m.value.toFixed(2)} <small>/ 6</small></b></div><div class="coach-bar" role="img" aria-label="${esc(m.name)} 선수 ${m.value??'미측정'}점, 성장단계 평균 ${m.mean?.toFixed(2)??'없음'}점"><span style="width:${(m.value||0)/6*100}%"></span>${m.mean!==null?`<i style="left:${m.mean/6*100}%"></i>`:''}</div><div class="metric-reference">평균 ${m.mean?.toFixed(2)??'—'} · ${m.delta===null?'비교 보류':`${m.delta>=0?'+':''}${m.delta.toFixed(2)}점`} <small>n=${m.n}${m.n>0&&m.n<10?' · 소표본':''}</small></div></div>`;
 const tags=(list,empty)=>list.length?list.map(m=>`<span>${esc(m.name)} ${m.delta>0?'+':''}${m.delta.toFixed(2)}</span>`).join(''):`<span>${empty}</span>`;
 if(profile){const type=reportTypes[profile.record.type];$('coach-profile').innerHTML=`<header class="coach-profile-heading"><div><strong>멘탈퍼포먼스 스냅샷 · 리포트 결과</strong><span>${esc(profile.record.date||'검사일 미등록')} · ${esc(profile.stage||'성장단계 미확인')}</span></div><div class="type-chip">${esc(profile.record.type||'—')} · ${esc(type?.name||profile.record.typeName||'유형 미확인')}</div></header><div class="profile-signals"><div class="signal-strength"><b>상대 강점</b>${tags(profile.strengths,'뚜렷한 평균 차이 없음')}</div><div class="signal-focus"><b>우선 보완</b>${tags(profile.focus,'뚜렷한 평균 차이 없음')}</div><div class="type-guidance">${esc(type?.coach?.find(t=>t!=='목표는 한 번에 하나만')||'선수의 실제 경험과 함께 확인하세요.')}</div></div><div class="metric-row five"><span class="metric-group-label">5대 지표</span>${profile.metrics.slice(0,5).map(bar).join('')}</div><div class="metric-row four"><span class="metric-group-label">8대 세부<br>①</span>${profile.metrics.slice(5,9).map(bar).join('')}</div><div class="metric-row four"><span class="metric-group-label">8대 세부<br>②</span>${profile.metrics.slice(9).map(bar).join('')}</div><p class="profile-legend">막대: 선수 점수 · 세로선: 동일 성장단계 검사 평균 · 강점/보완: 평균 대비 ±0.30점 기준의 상담 단서 · 유형은 고정된 성격이나 진단이 아닙니다.${!coachClaims.mentalAdmin?' 비교 평균은 이전한 원본 검사 집계입니다.':''}</p>${profile.caution?'<p class="profile-caution">5.5점 이상 응답: 과도한 자기신념 또는 실제 수행보다 긍정적인 응답 가능성을 경기 사례와 함께 확인하세요.</p>':''}`;}else $('coach-profile').innerHTML=`<strong>멘탈퍼포먼스 스냅샷 · 리포트 결과</strong><p class="muted">${esc(profileStatus)}</p>`;
 const recent=diaryRows(p);const sessionReflections=recentDiary({...p,diaryEntries:[]},sessions());
 const dk=JSON.stringify([p.id,p.diaryNote,recent,sessionReflections]);if(dk===diaryRenderKey)return;diaryRenderKey=dk;
 const start=new Date();start.setDate(start.getDate()-13);const startKey=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(start);const period=recent.filter(r=>r.date>=startKey&&r.date<=today());
 const actions=DIARY_ACTIONS.map((label,i)=>({label,count:period.filter(r=>r.mental?.includes(i)).length})).filter(v=>v.count).sort((a,b)=>b.count-a.count);
 const sleepCount=period.filter(r=>r.sleep==='뒤척였어요').length,stressCount=period.filter(r=>r.stress==='많이 부담돼').length;
 $('coach-diary').innerHTML=`<header><strong>최근 다이어리 · 20260916 diary</strong><div class="resource-actions"><a class="button" href="resources/20260916%20diary/index.html?player=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">선수 다이어리 열기 ↗</a><label class="button diary-import-label">기존 백업 가져오기<input id="diary-backup-file" type="file" accept=".json,application/json" hidden></label></div></header><div class="diary-overview"><div class="diary-records">${recent.length?recent.slice(0,3).map(d=>`<article><div><b>${esc(d.date)} · ${esc(d.type||'')}</b><small>${esc(MOODS[d.mood-1]||'마음 미기록')} · ${esc(d.body||'몸 미기록')} · ${esc(d.sleep||'수면 미기록')}</small></div><p class="diary-actions">${(d.mental||[]).map(i=>`<span>${esc(DIARY_ACTIONS[i])}</span>`).join('')||'선택한 작은 시도 없음'}</p>${d.note?`<p class="diary-quote">“${esc(d.note)}”</p>`:''}<div class="diary-selfcheck">${[['돌봄',(d.routines||[]).join(' · ')],['불편 부위',(d.areas||[]).join(' · ')],['피로',d.fatigue],['부담',d.stress],['근육',d.muscle],['수면',d.sleepDuration],['운동 시간',d.duration],['강도',d.exertion],['만족감',d.satisfaction],['불편',d.painLevel]].filter(([,v])=>v).map(([k,v])=>`<span>${k} · ${esc(v)}</span>`).join('')}</div>${d.hope?`<p><b>다음 시도</b> ${esc(d.hope)}</p>`:''}</article>`).join(''):'<p class="muted">이 선수에게 연결된 다이어리 기록이 없습니다. 기존 다이어리의 내 설정 → 기록 백업 파일을 가져오거나, 위 선수 다이어리에서 기록하세요.</p>'}${sessionReflections.length||p.diaryNote?`<details><summary>상담에서 공유받은 회고 · 메모</summary>${sessionReflections.map(d=>`<p><b>${esc(d.date)}</b> ${esc(d.note)}</p>`).join('')}${p.diaryNote?`<p class="diary-shared">${esc(p.diaryNote)}</p>`:''}</details>`:''}</div><aside class="diary-prompts"><b>최근 14일 · ${period.length}일 기록</b><div class="diary-trend" role="img" aria-label="최근 최대 7개 기록의 마음 흐름">${period.slice(0,7).reverse().map(r=>`<div><span>${r.mood}/5</span><i style="height:${r.mood*6}px"></i><small>${esc(r.date.slice(5))}</small></div>`).join('')}</div><p>${actions.length?`<b>이어갈 강점</b> ${esc(actions[0].label)} · ${actions[0].count}일`:'기록이 쌓이면 반복해서 시도한 행동을 표시합니다.'}</p>${sleepCount||stressCount?`<p class="diary-attention">확인할 신호 · 뒤척임 ${sleepCount}일 / 큰 부담 ${stressCount}일</p>`:''}<ol><li>${actions.length?'그 행동이 도움이 된 상황은 언제였나요?':'최근 흔들린 순간, 어떤 작은 시도를 했나요?'}</li><li>${sleepCount||stressCount?'몸·수면·부담이 플레이에 어떤 영향을 줬나요?':'실수 후 다시 내 플레이로 돌아오는 데 무엇이 도움이 됐나요?'}</li><li>다음 훈련에서 반복할 행동 하나와 확인 시점은?</li></ol><p class="tiny">선수 자가 기록의 상담 단서입니다. 검사 점수로 환산하거나 진단하지 않습니다.</p></aside></div><div id="diary-import-preview" hidden></div>`;
 const bound=p.id;$('diary-backup-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>900000)throw Error('백업 파일이 너무 큽니다.');const backup=validateDiaryBackup(JSON.parse(await file.text()));if(playerId!==bound)return;const box=$('diary-import-preview');box.hidden=false;box.innerHTML=`<p><b>연결할 선수</b> ${esc(p.name)} · ${esc(playerCode(p))}<br><b>백업 프로필</b> ${esc(backup.settings?.name||'이름 없음')} · ${esc(backup.settings?.birthdate||'생년월일 없음')} · 기록 ${backup.records.length}건</p><p class="tiny">같은 선수의 기록인지 확인한 뒤 가져오세요. 이름만으로 자동 연결하지 않습니다.</p><button id="confirm-diary-import" class="primary">이 선수의 기록으로 가져오기</button><button id="cancel-diary-import" class="button">취소</button>`;$('cancel-diary-import').onclick=()=>box.hidden=true;$('confirm-diary-import').onclick=()=>{if(playerId!==bound||!coachAuthorized(bound))return;write('players',bound,{diaryRecords:mergeDiaryRecords(state.players[bound].diaryRecords||{},backup.records)});renderCoachPanels(state.players[bound]);flush();toast('기존 다이어리 기록을 연결했습니다.');};}catch(error){toast(error.message||'다이어리 백업 파일을 확인해주세요.');}finally{e.target.value='';}};

}

function renderChart(force = false) {
  if(state.players[playerId]?.deletedAt){playerId='';sessionId='';expandedSessionId='';const url=new URL(location.href);url.searchParams.delete('player');history.replaceState(null,'',url);}
  recording.sync();
  const p = state.players[playerId], list = sessions();
  renderCoachPanels(p);
  $('chart-empty').hidden = !!p; $('chart-body').hidden = !p;
  $('chart-player-card').hidden = !p;
  $('chart-player-card').innerHTML = p ? `<div class="player-identity-name"><span class="eyebrow">현재 차팅 선수</span><h2>${esc(p.name)} <span class="player-state ${p.active ? 'active' : 'inactive'}">${p.active ? '활성' : '비활성'}</span><span id="player-growth-identity" class="player-growth-identity"></span></h2><span class="player-identity-id">선수 ID · ${esc(p.id)}</span></div><dl class="player-identity-details"><div><dt>고유번호</dt><dd>${esc(playerCode(p))}</dd></div><div><dt>소속 팀 · 기관</dt><dd>${esc(p.organization || '미등록')}</dd></div><div><dt>담당 멘탈코치</dt><dd>${esc(p.coach || '미지정')}</dd></div><div><dt>프로그램</dt><dd>${esc(p.program || '미등록')}</dd></div></dl>` : '';
  if(p)renderGrowthIdentity(profileFor(profileReports,p.reportSourcePlayerId||(p.source==='2026mental2'?p.id:''),coachClaims.mentalAdmin?{}:stageReference));
  $('open-mental-report').hidden=!p?.reportSourcePlayerId && p?.source!=='2026mental2';
  $('diary-note').disabled = !p;
  $('delete-current-player').disabled = !p || coachClaims.mentalAdmin!==true;
  $('add-session').disabled = !p; $('edit-current-player').disabled = !p;
  $('copy-session').disabled = !state.sessions[sessionId] || !!state.sessions[sessionId]?.deletedAt;
  $('delete-consultation').disabled = !p || !state.sessions[sessionId] || !!state.sessions[sessionId]?.deletedAt || !coachAuthorized(playerId);
  $('chart-title').textContent = '상담 노트';
  $('coaching-flow').hidden = !p;
  $('summary-context').textContent = p ? `${playerLabel(p)}\n최근 ${Math.min(4,recorded().length)}회 기록` : '차팅할 선수를 선택하세요.';
  $('generate-summary').disabled = !p || !recorded().length || !aiReady || !coachAuthorized(playerId) || aiBusy;
  $('summary-text').disabled = !p; $('copy-summary').disabled = !p || !state.summaries[playerId]?.text;
  $('session-player-name').textContent=p?.name||'선수 선택';
  if (!p) { $('summary-text').value = ''; $('session-list').replaceChildren();$('session-count').textContent='0';$('previous-session-plan').hidden=true;$('diary-note').value='';$('player-links').replaceChildren();return; }
  if (!state.sessions[sessionId] || state.sessions[sessionId].deletedAt || state.sessions[sessionId].playerId !== playerId) {sessionId = list.at(-1)?.id || '';expandedSessionId=sessionId;}
  recording.sync();
  $('session-count').textContent=String(list.length);
  $('session-list').innerHTML = [...list].reverse().map(s => `<div class="session-entry ${s.id===sessionId?'current':''}"><button type="button" class="session-choice" data-session="${esc(s.id)}" aria-current="${s.id === sessionId}" aria-expanded="${s.id===expandedSessionId}"><span class="session-choice-header"><b>${list.indexOf(s)+1}회차</b><time>${esc((s.date||'날짜 미등록').replaceAll('-','.'))}</time><span class="session-complete-dot" data-completion-session="${esc(s.id)}" role="img" aria-label="상담 마무리 완료" title="상담 마무리 완료" ${s.completedAt&&!state.pending[`sessions/${s.id}`]?.data.completedAt?'':'hidden'}></span><span class="entry-arrow" aria-hidden="true">${s.id===expandedSessionId?'⌃':'⌄'}</span></span><strong class="session-topic-preview">${esc(s.topic || '상담 주제 미입력')}</strong><small>${esc(s.coach || '담당 미지정')}</small></button>${s.id===expandedSessionId?`<div class="session-expanded-note"><b>상담 · 메모</b><p>${esc(s.note||'아직 작성한 상담 메모가 없습니다.')}</p>${s.diary?`<b>다이어리 회고</b><p>${esc(s.diary)}</p>`:''}${s.next?`<b>다음 행동</b><p>${esc(s.next)}</p>`:''}</div>`:''}</div>`).join('') || '<p class="rail-empty">새 회차를 만들면<br>이곳에 최신순으로 쌓입니다.</p>';
  $('session-list').querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{expandedSessionId=expandedSessionId===b.dataset.session?'':b.dataset.session;sessionId=b.dataset.session;renderChart(true);setCoachingStep('record');$('consultation-record').open=true;});
  const s = state.sessions[sessionId];
  const previous=list[list.findIndex(item=>item.id===sessionId)-1];
  $('previous-session-plan').hidden=!previous || !(previous.next || previous.question);
  $('previous-session-plan').innerHTML=previous?`<h4>지난 회차에서 이어가기</h4><small>${esc(previous.date||'')} · ${list.indexOf(previous)+1}회</small>${previous.next?`<p><b>행동 약속</b>${esc(previous.next)}</p>`:''}${previous.question?`<p><b>확인할 질문</b>${esc(previous.question)}</p>`:''}`:'';
  $('delete-consultation').disabled=!s || !coachAuthorized(playerId);
  $('delete-session-note').disabled=!s?.note?.trim();
  $('note-deletion-history').hidden=!s?.noteDeletionHistory?.length;
  $('note-history-list').innerHTML=[...(s?.noteDeletionHistory||[])].reverse().map(h=>`<article><b>${esc(new Date(h.deletedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</b><small> · 삭제자 ${esc(h.deletedBy)}</small><pre>${esc(h.text)}</pre></article>`).join('');
  $('session-form').hidden = !s; $('session-empty').hidden = !!s;
  $('session-title').textContent = s ? `${list.indexOf(s)+1}회차 · 상담 및 메모` : '회차를 선택하세요';
  $('consultation-date').textContent=s?.date||'';
  if(force){$('consultation-record').open=true;$('finish-feedback').textContent='';}
  if (s) for (const f of fields) if (force || document.activeElement !== $('session-'+f)) $('session-'+f).value = s[f] || '';
  if (force || document.activeElement !== $('diary-note')) $('diary-note').value = p.diaryNote || '';
  if (force || document.activeElement !== $('summary-text')) $('summary-text').value = state.summaries[playerId]?.text || '';
  $('player-links').innerHTML = [['reportUrl','멘탈 리포트 ↗'],['diaryUrl','선수 다이어리 ↗']].filter(([key])=>safeUrl(p[key])).map(([key,label])=>`<a class="button" href="${esc(safeUrl(p[key]))}" target="_blank" rel="noopener">${label}</a>`).join('');
  const sum=state.summaries[playerId];
  $('summary-status').textContent = sum?.text ? `${sum.source === 'ai' ? 'AI 생성' : '코치 수정'} · ${sum.updatedAt ? new Date(sum.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : ''}${sum.fingerprint && sum.fingerprint !== fingerprint() ? ' · 기록이 변경되어 재요약 필요' : ''}` : '요약도 수정하면 자동 저장됩니다.';
}
async function loadReportRoster() {
  const uid=auth?.currentUser?.uid;
  if(!uid || coachClaims.mentalAdmin!==true)return;
  $('report-player-status').textContent='리포트 선수 목록을 불러오는 중입니다…';
  try{
    const snapshot=await sdk.getDocs(sdk.collection(db,'mental_report_players'));
    if(auth?.currentUser?.uid!==uid)return;
    reportRoster=Object.fromEntries(snapshot.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    renderReportPicker();
    $('report-player-status').textContent=`리포트 선수 ${Object.keys(reportRoster).length}명 · 선택한 선수만 관리 목록으로 가져옵니다.`;
  }catch{ $('report-player-status').textContent='리포트 선수 목록을 불러오지 못했습니다. 저장소 연결을 확인해주세요.'; }
}
function renderReportPicker() {
  const chosen=$('report-player-choice').value;
  const list=filterReportRoster(reportRoster,$('report-player-search').value);
  $('report-player-choice').replaceChildren();
  const first=document.createElement('option');first.value='';first.textContent=list.length?'이름 · 차트번호 · 생년월일을 확인하고 선택하세요.':'검색 결과가 없습니다.';$('report-player-choice').append(first);
  for(const p of list){const o=document.createElement('option');o.value=p.id;o.textContent=`${p.name} · ${p.number||'차트번호 미등록'} · ${p.birth||'생년월일 미등록'} · ${p.organization||'소속 미등록'}${findEnrolledPlayer(state.players,p.id)?.deletedAt?' · 삭제됨':findEnrolledPlayer(state.players,p.id)?' · 관리 중':''}`;$('report-player-choice').append(o);}
  $('report-player-choice').value=list.some(p=>p.id===chosen)?chosen:'';
}
function openPlayer(id = '') {
  editingPlayer = id; const p = state.players[id] || {};
  selectedReportSource=p.reportSourcePlayerId || (p.source==='2026mental2'?p.id:'') || '';
  $('player-form').reset(); $('player-dialog-title').textContent = id ? '선수 정보 수정' : '선수 등록';
  for (const key of ['name','birth','sex','number','coach','organization','program','reportUrl','diaryUrl','note']) $('player-form').elements[key].value = p[key] || (key==='program'?'멘탈강화':'');
  $('player-form').elements.active.value = String(p.active !== false);
  $('report-player-search').value='';$('report-player-choice').value='';
  $('report-player-picker').hidden=coachClaims.mentalAdmin!==true;
  $('player-dialog').showModal();loadReportRoster();
}
$('report-player-search').addEventListener('input',renderReportPicker);
$('use-report-player').onclick=()=>{
  const source=reportRoster[$('report-player-choice').value];if(!source){$('report-player-status').textContent='가져올 리포트 선수를 선택해주세요.';return;}
  const existing=findEnrolledPlayer(state.players,source.id);
  if(existing?.deletedAt){$('report-player-status').textContent='삭제된 선수입니다. 관리 선수 목록의 삭제된 선수에서 복원해주세요.';return;}
  if(existing && existing.id!==editingPlayer){$('player-dialog').close();selectPlayer(existing.id);toast('이미 관리 중인 선수입니다. 기존 차팅을 열었습니다.');return;}
  selectedReportSource=source.id;
  for(const [key,value] of Object.entries(reportEnrollmentFields(source)))$('player-form').elements[key].value=value;
  $('report-player-status').textContent=`${source.name} · ${source.number||'차트번호 미등록'} 선택됨 · 저장하기를 눌러야 관리 선수로 등록됩니다.`;
};
function showView() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const view = hash === 'mental-report' ? 'mental-report' : hash.startsWith('mental-evidence') ? 'mental-evidence' : hash.startsWith('mental-diary') ? 'mental-diary' : hash === 'chart' ? 'chart' : 'mental';
  document.body.classList.toggle('report-open',view === 'mental-report');
  document.body.classList.toggle('chart-open',view === 'chart');
  if(view === 'mental-report' && !document.body.classList.contains('auth-locked')){
    const frame=$('mental-report-frame');
    if(!frame.getAttribute('src'))frame.src='./reports/2026mental2/index.html'+(reportFocusPlayer?'?player='+encodeURIComponent(reportFocusPlayer):'');
    else if(reportFocusPlayer)frame.contentWindow?.postMessage({type:'workspace-player',playerId:reportFocusPlayer},location.origin);
    reportFocusPlayer='';
  }
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view);
  document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-current',el.dataset.view===view?'page':'false'));
  if (hash && !['mental','chart','mental-diary','mental-evidence','mental-report'].includes(hash)) document.getElementById(hash)?.scrollIntoView({behavior:'smooth'});
  else window.scrollTo(0,0);
}
async function copy(text) {
  if (!text) return toast('복사할 기록이 없습니다.');
  try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); }
  catch {
    const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();
    const ok=document.execCommand('copy');area.remove();toast(ok?'복사했습니다.':'복사 권한이 없습니다. 텍스트를 선택해 복사하세요.');
  }
}
function sessionText(s) {
  const p=state.players[s.playerId];
  return [`${p ? playerLabel(p) : '선수'}\n선수 ID: ${s.playerId}`,`${sessions(s.playerId).findIndex(v=>v.id===s.id)+1}회 · ${s.date}`,`담당 코치: ${s.coach || '미등록'}`, ...fields.filter(f=>!['date','coach'].includes(f)&&s[f]).map(f=>({topic:'상담 주제',assessment:'서베이 · 리포트 관찰',note:'상담 기록',diary:'다이어리 회고',next:'다음 행동',question:'다음 질문'}[f])+':\n'+s[f])].join('\n\n');
}
function summaryInput(id = playerId) {
  return latestFourInput(state.players,state.sessions,id);
}
function fingerprint(id = playerId) { return JSON.stringify(summaryInput(id)); }
function scheduleAI() {
  clearTimeout(aiTimer);
  if ($('auto-summary').checked) aiTimer=setTimeout(()=>generateSummary(false),10000);
}
async function generateSummary(manual = true) {
  const id=playerId;
  if (!id || !aiReady || !coachAuthorized(id) || aiBusy || !recorded(id).length) return;
  if (!cloudReady || Object.keys(state.pending).length) { if(manual)toast('Firebase 저장 완료 후 요약할 수 있습니다.');scheduleAI();return; }
  const fp=fingerprint(id); if (!manual && state.summaries[id]?.fingerprint === fp) return;
  const oldRevision=state.summaries[id]?.updatedAt;
  const generation=++generationSerial; aiBusy=true; renderChart(false);
  $('ai-status').textContent='최근 4회 기록을 AI가 요약 중입니다…';
  try {
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(summaryEndpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(summaryInput(id)),signal:AbortSignal.timeout(90000)});
    const result=await readApiResponse(response);
    if (!response.ok || !result.text) throw new Error(result.error || 'AI 요약 응답을 확인할 수 없습니다.');
    if (fp!==fingerprint(id) || state.summaries[id]?.updatedAt !== oldRevision || generation !== generationSerial) {
      $('ai-status').textContent='기록이 변경되어 새 요약을 준비합니다.';scheduleAI();return;
    }
    write('summaries',id,{playerId:id,text:result.text,source:'ai',model:result.model || '',fingerprint:fp,sessionIds:summaryInput(id).sessions.map(s=>s.id)});
    $('ai-status').textContent='AI 연결됨 · 요약 자동 저장';if(playerId===id)renderChart(false);flush();
  } catch (error) { const message=apiErrorMessage(error);$('ai-status').textContent=message;if(manual)toast(message); }
  finally { aiBusy=false;renderChart(false); }
}
async function checkAI() {
  try {
    const response=await fetch(healthEndpoint,{signal:AbortSignal.timeout(6000)}), data=await readApiResponse(response);
    aiReady=response.ok && data.ready;
    $('ai-status').textContent=aiReady ? (coachClaims.mentalCoach === true ? 'AI 연결됨 · 저장 후 최근 4회 자동 요약' : 'AI 요약은 승인된 코치 로그인 후 사용할 수 있습니다.') : 'AI 요약 서비스 연결을 준비 중입니다.';
  } catch { aiReady=false; $('ai-status').textContent='AI 요약 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'; }
  renderChart(false);scheduleAI();
}

function coachAuthorized(id) {
  return !!auth?.currentUser && !auth.currentUser.isAnonymous && coachClaims.mentalCoach === true && (coachClaims.mentalAdmin === true || coachClaims.mentalPlayerIds?.includes(id));
}
const recording = createRecording({
  context:()=>state.sessions[sessionId]?.playerId === playerId ? {playerId,sessionId,uid:auth?.currentUser?.uid || ''} : null,
  ready:()=>coachAuthorized(playerId),
  token:()=>auth.currentUser.getIdToken(), notify:toast,
  insert:(bound,summary)=>{
    if(bound.playerId !== playerId || bound.sessionId !== sessionId || bound.uid !== auth?.currentUser?.uid || !coachAuthorized(playerId)) throw new Error('선수·회차 또는 코치 권한이 변경되었습니다.');
    const existing = state.sessions[sessionId];
    if(!existing || existing.playerId !== bound.playerId) throw new Error('선수와 회차를 다시 확인해주세요.');
    const note = appendSummary(existing.note || '',summary,today());
    if(note.length > 20000) throw new Error('상담 메모가 20,000자를 넘습니다. 기존 기록을 별도로 정리한 뒤 삽입해주세요.');
    write('sessions',bound.sessionId,{note}); $('session-note').value=note; flush();
  }
});
function setLoginGate(locked,message='') {
  document.body.classList.toggle('auth-locked',locked);
  if(locked) {
    recording.cancel();reportRoster={};selectedReportSource='';reportFocusPlayer='';$('mental-report-frame').removeAttribute('src');
    if(!$('coach-dialog').open)$('coach-dialog').show();
    $('coach-login-status').textContent=message;
  }else if($('coach-dialog').open)$('coach-dialog').close();
}
$('coach-account').onclick=()=>{$('coach-login-status').textContent='';$('coach-dialog').showModal()};
$('coach-dialog').addEventListener('cancel',e=>{if(document.body.classList.contains('auth-locked'))e.preventDefault()});
$('coach-login-close').onclick=()=>{if(!document.body.classList.contains('auth-locked'))$('coach-dialog').close()};
async function changeAccount(action) {
  if(Object.keys(state.pending).length) {toast('현재 기록의 서버 저장이 완료된 후 계정을 변경해주세요.');return;}
  if(!authTools || !auth){toast('저장소 연결 후 다시 시도해주세요.');return;}
  recording.cancel();
  for(const stop of listeners)stop();listeners=[];cloudReady=false;coachClaims={};generationSerial++;clearTimeout(aiTimer);
  // Never keep a previous coach's cached roster in the next account.
  state={players:{},sessions:{},summaries:{},pending:{}};playerId='';sessionId='';cache();renderPlayers();renderChart(true);
  changingAccount=true;
  try {await action();$('coach-login').reset();$('coach-dialog').close();}
  catch { $('coach-login-status').textContent='아이디 또는 비밀번호를 확인해주세요.'; changingAccount=false;setLoginGate(true,$('coach-login-status').textContent);return; }
  changingAccount=false;await connect();checkAI();
}
$('coach-login').onsubmit=async e=>{
  e.preventDefault();const data=new FormData(e.target);
  const username=String(data.get('username') || '').trim();
  const email=loginAliases[username] || (username.includes('@') ? username : '');
  if(!email){$('coach-login-status').textContent='아이디 또는 비밀번호를 확인해주세요.';return;}
  const button=e.target.querySelector('[type="submit"]');button.disabled=true;
  $('coach-login-status').textContent='로그인 중…';
  await changeAccount(()=>authTools.signInWithEmailAndPassword(auth,email,data.get('password')));
  button.disabled=false;
};
$('coach-logout').onclick=()=>changeAccount(()=>authTools.signOut(auth));

$('player-form').onsubmit=e=>{
  e.preventDefault();const values=Object.fromEntries(new FormData(e.target));
  values.name=values.name.trim();if(!values.name)return;
  const source=reportRoster[selectedReportSource];
  if(selectedReportSource && !source){toast('리포트 선수 목록을 다시 불러온 뒤 저장해주세요.');return;}
  const already=selectedReportSource && findEnrolledPlayer(state.players,selectedReportSource);
  if(already?.deletedAt||state.players[editingPlayer]?.deletedAt){toast('삭제된 선수는 관리 목록에서 먼저 복원해주세요.');return;}
  if(already && already.id!==editingPlayer){$('player-dialog').close();selectPlayer(already.id);toast('이미 관리 중인 선수입니다.');return;}
  const id=editingPlayer || selectedReportSource || crypto.randomUUID();values.active=values.active==='true';
  values.managed=true;
  if(source){values.reportSourcePlayerId=source.id;values.source='mental-report';values.reportIds=source.reportIds||[];}

  if(!editingPlayer)values.createdAt=new Date().toISOString();
  write('players',id,values);$('player-dialog').close();selectPlayer(id);
};
document.querySelectorAll('[data-add-player]').forEach(b=>b.onclick=()=>openPlayer());
$('close-player').onclick=()=>$('player-dialog').close();
$('edit-current-player').onclick=()=>playerId&&openPlayer(playerId);
$('player-filter').add(new Option('삭제된 선수','deleted'));
$('delete-current-player').onclick=()=>changePlayerDeletion(playerId,true);
function changePlayerDeletion(id,deleting){
 const p=state.players[id];if(!p||!coachAuthorized(id)||coachClaims.mentalAdmin!==true||!!p.deletedAt===deleting)return;
 if(deleting&&!confirm(`${p.name} · ${playerCode(p)} 선수를 관리 목록에서 삭제할까요?\n상담·회차·리포트는 보관되며 삭제된 선수 목록에서 복원할 수 있습니다.`))return;
 const at=new Date().toISOString(),by=auth.currentUser.uid;
 const patch={deletedAt:deleting?at:null,deletedBy:deleting?by:null,active:deleting?false:p.activeBeforeDeletion!==false,managementHistory:[...(p.managementHistory||[]),{action:deleting?'delete':'restore',at,by}]};
 if(deleting)patch.activeBeforeDeletion=p.active!==false;
 if(id===playerId)recording.cancel();
 write('players',id,patch);renderChart(true);renderPlayers();flush();
 toast(deleting?'관리 목록에서 삭제했습니다. 삭제된 선수에서 복원할 수 있습니다.':'선수와 기존 회차 기록을 복원했습니다.');
}

$('open-mental-report').onclick=()=>{const p=state.players[playerId];reportFocusPlayer=p?.reportSourcePlayerId||(p?.source==='2026mental2'?p.id:'')||'';};
for(const id of ['player-search','coach-filter','player-filter'])$(id).addEventListener('input',renderPlayers);
$('chart-player').onchange=e=>selectPlayer(e.target.value);
$('add-session').onclick=()=>{
  const p=state.players[playerId];if(!p)return;
  sessionId=crypto.randomUUID();write('sessions',sessionId,{playerId,createdAt:new Date().toISOString(),...Object.fromEntries(fields.map(f=>[f,f==='date'?today():f==='coach'?p.coach || '':'']))});
  expandedSessionId=sessionId;renderChart(true);renderPlayers();setCoachingStep('record');$('session-note').focus();
};
let coachingStep = 'prepare';
function setCoachingStep(step) {
  coachingStep = step;
  $('finish-recap').textContent = state.sessions[sessionId]?.note || '작성한 상담 내용이 없습니다. 행동 약속만 남길 수도 있습니다.';
  $('chart').dataset.coachingStep = step;
  $('finish-recap').textContent = state.sessions[sessionId]?.note || '작성한 상담 내용이 없습니다. 행동 약속만 남길 수도 있습니다.';
  document.querySelectorAll('[data-coaching-step]').forEach(button => button.setAttribute('aria-current', button.dataset.coachingStep === step ? 'step' : 'false'));
  $('consultation-record').open = true;
  if (step === 'record' && state.sessions[sessionId]) $('session-note').focus({preventScroll:true});
  if (step === 'finish' && state.sessions[sessionId]) $('session-next').focus({preventScroll:true});
}
document.querySelectorAll('[data-coaching-step]').forEach(button => button.addEventListener('click', () => setCoachingStep(button.dataset.coachingStep)));
$('start-prepared-session').onclick = () => $('add-session').click();
$('finish-consultation').onclick = async () => {
  const s = state.sessions[sessionId];
  if (!s || !coachAuthorized(playerId)) return;
  if (!s.note?.trim() && !s.next?.trim()) {
    $('finish-feedback').textContent = '상담 내용이나 다음 행동을 먼저 남겨주세요.';
    return;
  }
  const finishingPlayer = playerId, finishingSession = sessionId;
  write('sessions',sessionId,{completedAt:new Date().toISOString(),completedBy:auth.currentUser.uid});
  await flush();
  if (finishingPlayer !== playerId || finishingSession !== sessionId) return;
  $('finish-feedback').textContent = Object.keys(state.pending).length || !cloudReady
    ? '기기에 기록을 보관했습니다. 상단 저장 상태를 확인하고 서버 저장을 재시도해주세요.'
    : '상담 기록이 저장되었습니다. 다음 상담에서 오늘의 행동 약속을 확인하세요.';
};
setCoachingStep('prepare');
$('session-form').onsubmit=e=>e.preventDefault();
for(const f of fields)$('session-'+f).addEventListener('input',e=>{
  if(!sessionId)return;write('sessions',sessionId,{[f]:e.target.value});
  if(f==='note')$('delete-session-note').disabled=!e.target.value.trim();
  if(['date','coach','topic'].includes(f)){const focused=e.target;renderChart(false);focused.focus()}
  renderPlayers();
});
$('diary-note').oninput=e=>{if(state.players[playerId])write('players',playerId,{diaryNote:e.target.value})};
$('summary-text').oninput=e=>{if(playerId){write('summaries',playerId,{playerId,text:e.target.value,source:'coach'});$('copy-summary').disabled=!e.target.value}};
let consultationDeleteTarget = null;
$('delete-consultation').onclick=()=>{
  const s=state.sessions[sessionId];
  if(!s || s.deletedAt || s.playerId!==playerId || !coachAuthorized(playerId))return;
  consultationDeleteTarget={id:s.id,playerId,uid:auth.currentUser.uid};
  $('delete-consultation-context').textContent=`${playerLabel(state.players[playerId])} · ${sessions().findIndex(v=>v.id===s.id)+1}회차 · ${s.date || '날짜 미등록'}`;
  $('delete-consultation-dialog').showModal();
};
$('cancel-consultation-delete').onclick=()=>$('delete-consultation-dialog').close();
$('delete-consultation-dialog').addEventListener('close',()=>{consultationDeleteTarget=null;});
$('confirm-consultation-delete').onclick=()=>{
  const target=consultationDeleteTarget,s=state.sessions[target?.id];
  if(!target || !s || s.deletedAt || target.playerId!==playerId || target.id!==sessionId || target.uid!==auth?.currentUser?.uid || !coachAuthorized(target.playerId)){
    $('delete-consultation-dialog').close();return;
  }
  recording.cancel();
  write('sessions',s.id,{deletedAt:new Date().toISOString(),deletedBy:auth.currentUser.uid});
  if(!recorded().length && state.summaries[playerId]?.text)write('summaries',playerId,{text:'',sessionIds:[],fingerprint:'',source:'coach'});
  sessionId=sessions().at(-1)?.id || '';expandedSessionId=sessionId;
  $('delete-consultation-dialog').close();
  renderChart(true);renderPlayers();setCoachingStep(sessionId?'record':'prepare');flush();
  toast('회차 상담을 삭제했습니다. 저장 상태는 상단에서 확인할 수 있습니다.');
};
$('delete-session-note').onclick=()=>{const s=state.sessions[sessionId];if(!s||s.playerId!==playerId||state.players[playerId]?.deletedAt||!coachAuthorized(playerId))return;const patch=deleteNote(s,auth.currentUser.uid);if(!patch)return;recording.cancel();write('sessions',s.id,patch);renderChart(true);renderPlayers();flush();toast('메모를 삭제했습니다. 원문과 삭제 이력은 보관됩니다.');};
$('copy-session').onclick=()=>state.sessions[sessionId]&&copy(sessionText(state.sessions[sessionId]));
$('copy-summary').onclick=()=>{
  const p=state.players[playerId],text=state.summaries[playerId]?.text;
  if(p&&text)copy(`${playerLabel(p)}\n선수 ID: ${p.id}\n\n${text}`);else toast('복사할 기록이 없습니다.');
};
$('generate-summary').onclick=()=>generateSummary(true);
$('auto-summary').onchange=()=>scheduleAI();
$('summary-toggle').onclick=()=>{
  const dock=document.querySelector('.summary-dock');dock.classList.toggle('collapsed');
  $('summary-toggle').setAttribute('aria-expanded',String(!dock.classList.contains('collapsed')));
  $('summary-toggle').querySelector('span').textContent=dock.classList.contains('collapsed')?'열기 ⌃':'접기 ⌄';
};
$('retry-save').onclick=()=>{if(db&&cloudReady){flush();cloudStatus()}else connect();checkAI()};
$('import-basecamp').onclick=()=>{
  try {
    const data=JSON.parse(localStorage.getItem('mps-basecamp-data-v2') || 'null');
    const hq=JSON.parse(localStorage.getItem('mps-basecamp-hq-v1') || 'null');
    if(!data?.players?.length)return toast('이 브라우저에 베이스캠프 선수 기록이 없습니다.');
    const players=data.players.filter(p=>!p.sample&&(p.mentalManaged || /멘탈|mental/i.test(p.program || '')));
    if(!players.length)return toast('가져올 실제 멘탈 관리 선수가 없습니다.');
    if(!confirm(`${players.length}명의 선수와 회차 기록을 Firebase로 가져올까요? 이미 등록된 기록은 유지합니다.`))return;
    for(const p of players){
      if(!state.players[p.id])write('players',p.id,{name:p.name,number:p.number || '',coach:p.coach || '',program:p.program,active:p.active,organization:(p.orgIds || []).map(id=>data.organizations?.find(o=>o.id===id)?.name || '').filter(Boolean).join(' · '),reportUrl:safeUrl(p.reports?.mental),diaryUrl:safeUrl(p.diaryUrl),note:p.note || '',diaryNote:hq?.diaries?.[p.id] || '',createdAt:new Date().toISOString()});
      for(const s of hq?.sessions || [])if(s.playerId===p.id&&!state.sessions[s.id])write('sessions',s.id,{...s,createdAt:s.savedAt || `${s.date}T00:00:00.000Z`});
    }
    renderPlayers();flush();toast('베이스캠프 기록을 가져왔습니다.');
  }catch{toast('베이스캠프 기록의 형식을 확인할 수 없습니다.')}
};
window.addEventListener('hashchange',showView);
window.addEventListener('online',()=>{cloudStatus();flush();checkAI()});
window.addEventListener('offline',()=>cloudStatus());
window.addEventListener('beforeunload',e=>{if(auth?.currentUser && !auth.currentUser.isAnonymous)cache();if(Object.keys(state.pending).length || recording.active()){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden' && auth?.currentUser && !auth.currentUser.isAnonymous){cache();flush()}});

$('player-search').placeholder='선수명 · 고유번호 · 소속 검색';
renderPlayers();renderChart(true);showView();cloudStatus();connect();checkAI();
