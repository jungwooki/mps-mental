import {firebaseConfig} from '../../config.js';
import {mergeDiaryRecords,validateDiaryBackup} from '../../coach-dashboard.js';
(async()=>{
 const playerId=new URLSearchParams(location.search).get('player');if(!playerId)return;
 const banner=document.createElement('div');banner.className='diary-cloud-banner';banner.setAttribute('role','status');document.body.prepend(banner);
 const show=(message,lock=false)=>{banner.textContent=message;document.querySelector('#main').hidden=lock;document.querySelector('#navigation').hidden=lock;};
 show('선수 다이어리 연결 확인 중…',true);
 const base='https://www.gstatic.com/firebasejs/11.6.1/';let auth,fs,ref,uid='',ready=false,busy=false,pending=false,retry;
 try{
  const [apps,authSDK,fire]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);fs=fire;
  const app=apps.getApps()[0]||apps.initializeApp(firebaseConfig);auth=authSDK.getAuth(app);await auth.authStateReady();
  if(!auth.currentUser||auth.currentUser.isAnonymous)throw Error('워크스페이스에 로그인한 후 선수 다이어리를 여세요.');
  uid=auth.currentUser.uid;const claims=(await auth.currentUser.getIdTokenResult()).claims;
  if(!claims.mentalCoach||(!claims.mentalAdmin&&!claims.mentalPlayerIds?.includes(playerId)))throw Error('이 선수의 다이어리를 조회할 권한이 없습니다.');
  ref=fs.doc(fs.getFirestore(app),'mental_players',playerId);const snapshot=await fs.getDoc(ref);if(!snapshot.exists())throw Error('등록된 선수를 찾을 수 없습니다.');
  const player=snapshot.data();db.records=Object.values(mergeDiaryRecords(player.diaryRecords||{},db.records)).sort((a,b)=>b.date.localeCompare(a.date));
  db.settings={...db.settings,name:db.settings.name||player.name||'',birthdate:db.settings.birthdate||player.birth||''};
  localStorage.setItem(key,JSON.stringify(db));render();ready=true;
  const label=`${player.name} · ${player.number||'차트번호 미등록'}`;
  show(`${label} · Firebase 연결됨 · 저장하면 코치 차팅에 표시됩니다.`);
  authSDK.onAuthStateChanged(auth,user=>{if(!user||user.uid!==uid){ready=false;clearTimeout(retry);show('로그인이 변경되었습니다. 워크스페이스에서 다시 여세요.',true);}});
  async function saveCloud(){if(!ready||busy||!pending||auth.currentUser?.uid!==uid)return;busy=true;pending=false;
   try{const records=JSON.parse(JSON.stringify(db.records));validateDiaryBackup({records});await fs.runTransaction(fs.getFirestore(app),async tx=>{const latest=await tx.get(ref);if(!latest.exists())throw Error('선수 정보 없음');const merged=mergeDiaryRecords(latest.data().diaryRecords||{},records);validateDiaryBackup({records:Object.values(merged)});tx.update(ref,{diaryRecords:merged,diaryUpdatedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});});show(`${label} · Firebase 저장 완료 · 코치 차팅에 반영됩니다.`);}
   catch{pending=true;show(`${label} · 기기에 저장됨 · Firebase 재시도 대기`);clearTimeout(retry);retry=setTimeout(()=>{retry=null;saveCloud()},8000);}
   finally{busy=false;if(pending&&ready&&!retry)saveCloud();}
  }
  window.addEventListener('mps-diary-saved',()=>{pending=true;saveCloud();});window.addEventListener('online',()=>{retry=null;saveCloud();});
  // Merge only this explicitly linked player's scoped records; never the global personal diary.
  if(db.records.length){pending=true;saveCloud();}
 }catch(error){show(error.message||'다이어리 연결에 실패했습니다. 다시 여세요.',true);}
})();
