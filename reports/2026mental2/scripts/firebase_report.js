import {firebaseConfig} from '../../../config.js';
const SDK='https://www.gstatic.com/firebasejs/11.6.1/';
const [apps,authSDK,dbSDK]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
const app=apps.getApps()[0]||apps.initializeApp(firebaseConfig),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
await auth.authStateReady();
const status=document.getElementById('uploadStatus');
const feedback=(message,error=false)=>{status.hidden=false;status.textContent=message;status.classList.toggle('error',error)};
const BASE_ATHLETES=[];
function applyUploadedAthletes(saved){
  const identities=new Set(BASE_ATHLETES.map(MPSAthleteImport.key));
  const charts=new Set(BASE_ATHLETES.map(MPSAthleteImport.chartKey).filter(Boolean));
  ATH.splice(0,ATH.length,...BASE_ATHLETES);
  for(const a of saved){
    const identity=MPSAthleteImport.key(a),chart=MPSAthleteImport.chartKey(a);
    // Preserve every measurement, including repeated sessions of the same athlete.
    identities.add(identity);if(chart)charts.add(chart);
    ATH.push({...a,id:ATH.length});
  }
  for(const stage of ORDER){
    const group=ATH.filter(a=>a.growth.stage===stage),mgi=group.map(a=>a.mgi).filter(Number.isFinite);
    STAGE_GROUPS[stage]=group;
    STAGE_MEANS[stage]={n:group.length,mgi:mgi.length?mgi.reduce((a,b)=>a+b,0)/mgi.length:null,raw:Object.fromEntries(stageMetrics.map(n=>[n,mean(group,n)]))};
    DETAIL_STAGE_STATS[stage]=detailStats(group);
  }
  for(const k of Object.keys(AGE_GROUPS))delete AGE_GROUPS[k];
  for(const k of Object.keys(DETAIL_AGE_STATS))delete DETAIL_AGE_STATS[k];
  ATH.forEach(a=>{const years=detailAgeYears(a);if(years!==null)(AGE_GROUPS[years]??=[]).push(a);});
  for(const [years,records] of Object.entries(AGE_GROUPS))DETAIL_AGE_STATS[years]=detailStats(records);
  DATA.stats.stageConflicts=ATH.filter(a=>!a.growth.stage).length;
  DATA.stats.records=ATH.length;
  DATA.stats.identityKeys=new Set(ATH.map(MPSAthleteImport.key)).size;
  DATA.stats.boneValid=ATH.filter(a=>a.growth.boneMonths!==null).length;
  DATA.stats.delayed=ATH.filter(a=>a.growth.delayed).length;
  DATA.stats.stages=Object.fromEntries(ORDER.map(s=>[s,STAGE_GROUPS[s].length]));
  populate();
}
const frameURL=new URL(location.href);
let suppressSelection=false;
let currentPlayer=frameURL.searchParams.get('player')||'', cloudReports=[], reportIDs=new Set(), ready=false;
const upload=document.getElementById('athleteUploadBtn');upload.disabled=true;
const tools=document.createElement('div');tools.className='upload-feedback';
tools.innerHTML='<button type="button" id="importBrowserAthletes">브라우저 추가 선수 가져오기</button> <a href="../../index.html#chart" target="_top">회차별 차팅으로</a><p>리포트 선수와 검사 결과는 별도 목록에 저장됩니다. 관리 선수 등록은 워크스페이스의 선수 등록창에서 진행합니다.</p>';
document.querySelector('.upload-feedback').after(tools);
const notice=document.createElement('div');notice.id='report-score-review';notice.hidden=true;
document.getElementById('rawScores').after(notice);
const originalRender=window.render;
window.render=function(index){
 originalRender(index);
 const a=ATH[index];if(!a)return;
 window.MPS_SCORE_REVIEW?.renderNotice(notice,[{name:'MGI',score:a.mgi},...Object.entries(a.raw||{}).map(([name,score])=>({name,score}))]);
 currentPlayer=a.firebasePlayerId || '';

};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='workspace-player')return;
 currentPlayer=event.data.playerId||'';
 const index=ATH.findIndex(a=>a.firebasePlayerId===currentPlayer);
 if(index>=0){suppressSelection=true;document.getElementById('search').value='';populate();document.getElementById('athleteSelect').value=index;render(index);suppressSelection=false;document.getElementById('report').hidden=false;document.getElementById('printBtn').disabled=false;}
 else if(currentPlayer){document.getElementById('report').hidden=true;document.getElementById('printBtn').disabled=true;feedback('선택한 선수에게 연결된 리포트가 없습니다. 리포트 선수 목록에서 직접 선택하거나 Excel을 업로드해주세요.');}
});
const clean=value=>String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');
async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24)}
async function ids(record){
 const chart=clean(record.chart).toUpperCase();
 const playerId='mrp-'+await digest(chart?['chart',chart,clean(record.birth),clean(record.sex)]:['identity',clean(record.n).replace(/ /g,''),clean(record.birth),clean(record.sex)]);
 const source=record.source||{};
 const reportId='mrr-'+await digest([playerId,clean(record.date),clean(source.file),String(source.row||''),clean(record.type)]);
 return {playerId,reportId};
}
async function saveRecords(records){
 const token=(await auth.currentUser.getIdTokenResult()).claims;
 if(token.mentalAdmin!==true)throw Error('선수 데이터 가져오기는 관리자 계정에서 가능합니다.');
 const players=await dbSDK.getDocs(dbSDK.collection(db,'mental_report_players'));
 const knownPlayers=new Set(players.docs.map(d=>d.id));let added=0,batch=dbSDK.writeBatch(db),writes=0;
 for(const record of records){
  if(!record?.n||!record.raw||!record.growth||!TYPES[record.type])throw Error('선수 검사 데이터 형식을 확인해주세요.');
  const {playerId,reportId}=await ids(record);if(reportIDs.has(reportId))continue;
  const now=new Date().toISOString();
  if(!knownPlayers.has(playerId)){
   batch.set(dbSDK.doc(db,'mental_report_players',playerId),{id:playerId,name:record.n,birth:record.birth||'',sex:record.sex||'',number:record.chart||'',organization:record.team||'',program:'멘탈강화',coach:'',active:true,source:'2026mental2',createdAt:now,updatedAt:now,reportIds:[reportId],reportUrl:`./reports/2026mental2/index.html?player=${playerId}`});knownPlayers.add(playerId);writes++;
  }else{batch.update(dbSDK.doc(db,'mental_report_players',playerId),{reportIds:dbSDK.arrayUnion(reportId),updatedAt:now});writes++;}
  batch.set(dbSDK.doc(db,'mental_reports',reportId),{id:reportId,playerId,date:record.date||'',record,source:'2026mental2',createdAt:now,updatedAt:now});writes++;added++;
  if(writes>=400){await batch.commit();batch=dbSDK.writeBatch(db);writes=0;}
 }
 if(writes)await batch.commit();return added;
}
let excelLibrary;
function loadExcel(){if(globalThis.ExcelJS)return Promise.resolve();return excelLibrary??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/vendor/exceljs.min.js';script.onload=resolve;script.onerror=()=>{excelLibrary=null;reject(Error('Excel 읽기 도구를 불러오지 못했습니다.'))};document.head.append(script)})}
upload.onclick=()=>document.getElementById('athleteUploadInput').click();
document.getElementById('athleteUploadInput').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;upload.disabled=true;
 try{
  if(!/\.xlsx$/i.test(file.name)||file.size>20*1024*1024)throw Error('20MB 이하 .xlsx 파일을 선택해주세요.');
  feedback('선수 데이터를 확인하고 Firebase에 저장 중입니다…');await loadExcel();const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());
  const parsed=MPSAthleteImport.parseWorkbook(workbook,[],TYPES,file.name);
  const added=await saveRecords(parsed.added);feedback(`${added}건 Firebase 저장 완료 · 입력 오류 ${parsed.errors.length}건`,!!parsed.errors.length);
  const box=document.getElementById('uploadErrorList');box.replaceChildren();for(const e of parsed.errors){const li=document.createElement('li');li.textContent=`${e.row}행: ${e.reason}`;box.append(li)}document.getElementById('uploadErrors').hidden=!parsed.errors.length;
 }catch(error){feedback(error.message||'저장하지 못했습니다. 다시 시도해주세요.',true)}finally{upload.disabled=!ready;event.target.value=''}
};
document.getElementById('importBrowserAthletes').onclick=async()=>{
 try{
  const records=JSON.parse(localStorage.getItem('mps-mental2-athletes-v1')||'[]');if(!Array.isArray(records))throw Error('브라우저 선수 데이터 형식을 확인해주세요.');
  if(!records.length){feedback('현재 주소의 브라우저에는 추가 선수 기록이 없습니다. 다른 주소에서 업로드했다면 원본 Excel을 여기에서 다시 가져오세요.');return;}
  feedback('브라우저 추가 기록을 Firebase에 저장 중입니다…');feedback(`${await saveRecords(records)}건 가져오기 완료 · 원본 브라우저 기록은 유지됩니다.`);
 }catch(error){feedback(error.message||'가져오기에 실패했습니다.',true)}
};
if(!auth.currentUser||auth.currentUser.isAnonymous){feedback('먼저 멘탈 워크스페이스에서 로그인해주세요.',true);document.getElementById('report').hidden=true;tools.querySelector('button').disabled=true;}
else{
 const claims=(await auth.currentUser.getIdTokenResult()).claims;
 if(claims.mentalCoach!==true){feedback('멘탈코치 접근 권한이 필요합니다.',true);}
 else{
  const sources=claims.mentalAdmin===true?[dbSDK.collection(db,'mental_reports')]:Array.from({length:Math.ceil((claims.mentalPlayerIds||[]).length/30)},(_,i)=>dbSDK.query(dbSDK.collection(db,'mental_reports'),dbSDK.where('playerId','in',claims.mentalPlayerIds.slice(i*30,i*30+30))));
  const snapshots=new Map();
  sources.forEach((source,sourceIndex)=>dbSDK.onSnapshot(source,snapshot=>{
   const old=ATH[Number(document.getElementById('athleteSelect').value)];const desired=currentPlayer||old?.firebasePlayerId;
   snapshots.set(sourceIndex,snapshot.docs.map(d=>({id:d.id,...d.data()})));cloudReports=[...snapshots.values()].flat().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));reportIDs=new Set(cloudReports.map(r=>r.id));
   suppressSelection=true;
   applyUploadedAthletes(cloudReports.map(r=>({...r.record,firebaseReportId:r.id,firebasePlayerId:r.playerId})));
   const index=ATH.findIndex(a=>a.firebasePlayerId===desired);if(index>=0){document.getElementById('athleteSelect').value=index;render(index);}
   suppressSelection=false;
   const missing=desired && index<0;
   if(missing){currentPlayer=desired;document.getElementById('report').hidden=true;document.getElementById('printBtn').disabled=true;}

   ready=claims.mentalAdmin===true;upload.disabled=!ready;tools.querySelector('button').disabled=!ready;
   feedback(missing?'선택한 선수에게 연결된 리포트가 없습니다. 선수 목록에서 직접 선택하거나 Excel을 업로드해주세요.':`Firebase 연결 · 선수 ${new Set(cloudReports.map(r=>r.playerId)).size}명 · 검사 기록 ${cloudReports.length}건`);
  },()=>feedback('리포트를 불러오지 못했습니다. 로그인과 저장소 연결을 확인해주세요.',true)));
 }
}

authSDK.onAuthStateChanged(auth,user=>{if(!user||user.isAnonymous){ready=false;ATH.splice(0,ATH.length);populate();upload.disabled=true;tools.querySelector('button').disabled=true;feedback('로그아웃되었습니다. 워크스페이스에서 다시 로그인해주세요.',true)}});
