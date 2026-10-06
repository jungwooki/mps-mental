'use strict';
// Age is calculated from local calendar dates, never elapsed milliseconds or school grade.
function completedAge(value, at = new Date()) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [y,m,d]=value.split('-').map(Number), birth=new Date(y,m-1,d);
  if(y<1900||birth.getFullYear()!==y||birth.getMonth()!==m-1||birth.getDate()!==d)return null;
  let age=at.getFullYear()-y;
  if(at.getMonth()+1<m||(at.getMonth()+1===m&&at.getDate()<d))age--;
  return age<0?null:age;
}
function validBirthday(value){return completedAge(value)!==null;}
function ageGroup(){const age=completedAge(db.settings.birthdate);return age!==null&&age>=13?'teen':'junior';}
function ageHint(value){const age=completedAge(value);return age===null?'생일을 입력하면 나이에 맞는 질문을 준비해요.':`현재 만 ${age}세 · ${age<13?'쉽고 다정한 질문':'차분하고 구체적인 질문'}으로 만나요.`;}
function birthdayField(){return `<label class="field"><span>생년월일</span><input type="date" name="birthdate" required min="1900-01-01" max="${dayKey()}" value="${esc(db.settings.birthdate||'')}" aria-describedby="age-preview"></label><p class="info" id="age-preview">${ageHint(db.settings.birthdate)}</p>`;}
function setup(){return `<section class="onboarding"><div class="onboarding-intro"><div class="eyebrow">나의 첫 페이지</div><h1>조금씩 쌓아서,<br>나답게 단단해지기.</h1><p>잘한 날도, 쉬어간 날도.<br>내 마음과 몸의 이야기를 함께 모아봐요.</p><div class="intro-blocks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><span class="onboarding-caption">오늘의 작은 기록 → 내일의 나를 믿는 힘</span></div><form id="setup-form" class="card setup-card"><div class="card-head"><h2>먼저, 나를 알려줄래?</h2><small>처음 한 번</small></div><label class="field"><span>이름 또는 불리고 싶은 이름 <span class="muted">선택</span></span><input name="name" maxlength="12" autocomplete="nickname" value="${esc(db.settings.name||'')}" placeholder="예: 민준"></label>${birthdayField()}<div class="age-explainer">만 13세 생일부터 질문의 말투가 달라져요.<br>생일은 내 설정에서 수정할 수 있어요.</div><button class="primary full" type="submit">나의 다이어리 시작하기 ${icon('arrow')}</button><p class="info">생일과 기록은 이 기기의 브라우저에 저장돼요.</p></form></section>`;}
function growthBlocks(){const count=db.records.length;return `<div class="growth-blocks"><div class="block-stack" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<Math.min(count,5)?'filled':''}"></i>`).join('')}</div><strong>${count}일의 나</strong><span>${count?'작은 시도가 쌓이는 중':'첫 이야기를 기다리는 중'}</span></div>`;}
// Only presentation changes. Choice data-value attributes, canonical saved answers and counts stay stable.
const TEEN_COPY={
 '오늘의 나는 어땠어?':'오늘의 상태를 돌아볼까요?',
 '잘한 날도, 마음이 복잡한 날도 괜찮아.':'편안했던 순간과 복잡했던 마음 모두 기록해 보세요.',
 '지금, 어떤 마음이야?':'지금 마음 상태는 어떤가요?',
 '정답은 없어. 지금 내 마음과 가까운 걸 골라봐.':'지금 느끼는 감정에 가장 가까운 답을 선택해 주세요.',
 '지금 내 마음':'현재 마음 상태',
 '어떤 하루를 보냈어?':'오늘은 어떤 활동을 했나요?',
 '작지만, 내가 해낸 것.':'오늘 내가 보여준 힘.',
 '대단한 일이 아니어도 좋아. 떠오르는 순간을 골라봐.':'오늘 직접 시도했던 행동을 선택해 보세요.',
 '여러 개 골라도, 오늘은 그냥 넘어가도 괜찮아.':'여러 개를 골라도 되고, 떠오르지 않으면 넘어가도 괜찮아요.',
 '숨을 고른 나':'긴장을 다룬 나',
 '긴장 속에서도 한 번 시작했어':'긴장을 느끼면서도 필요한 행동을 시작했어요',
 '도움을 말한 나':'도움을 요청한 나',
 '혼자 참지 않고 마음을 말했어':'필요한 도움이나 내 생각을 표현했어요',
 '스스로 준비한 나':'스스로 준비한 나',
 '할 일 하나를 정하고 준비했어':'목표와 할 일을 정하고 준비했어요',
 '다시 도전한 나':'다시 도전한 나',
 '실수해도 다음 플레이로 돌아왔어':'실수한 뒤 다음 플레이에 다시 참여했어요',
 '집중을 되찾은 나':'집중을 되찾은 나',
 '잠깐 멈추고 내 할 일을 했어':'흔들린 감정을 정리하고 내 역할에 집중했어요',
 '나를 돌본 나':'회복을 챙긴 나',
 '필요할 때 충분히 쉬었어':'몸의 신호를 알아차리고 필요한 휴식을 취했어요',
 '몸의 이야기도 들어볼까?':'몸의 상태도 확인해 볼까요?',
 '잘 쉬는 것도 성장의 일부야. 느끼는 대로 골라줘.':'회복도 훈련의 일부예요. 현재 느끼는 상태를 선택해 주세요.',
 '오늘 몸은 어때?':'현재 몸의 컨디션은 어떤가요?',
 '어디가 불편했어?':'어느 부위가 불편한가요?',
 '불편했던 곳은 보호자나 선생님께도 이야기해줘.':'불편한 부위는 보호자나 선생님과도 공유해 주세요.',
 '어젯밤 잠은?':'어젯밤 수면의 질은 어땠나요?',
 '나를 위해 챙긴 것':'오늘 챙긴 회복 습관',
 '오늘 운동도 가볍게 돌아볼까?':'오늘 운동을 돌아볼까요?',
 '몸과 마음, 조금 더 살펴보기':'컨디션을 조금 더 구체적으로',
 '떠오르는 것만 골라도 돼. 같은 선택을 다시 누르면 지워져.':'답하고 싶은 항목만 선택하세요. 선택한 답을 다시 누르면 해제돼요.',
 '지금 얼마나 피곤해?':'현재 피로는 어느 정도인가요?',
 '마음에 부담이 있어?':'현재 스트레스나 심리적 부담은 어떤가요?',
 '근육이 뻐근하거나 뭉쳤어?':'근육의 뻐근함이나 뭉침은 어느 정도인가요?',
 '어젯밤 얼마나 잤어?':'어젯밤 실제로 잔 시간은 어느 정도인가요?',
 '오늘 운동한 시간을 모두 더하면?':'오늘 참여한 운동 시간을 합하면 어느 정도인가요?',
 '오늘 운동은 전체적으로 얼마나 힘들었어?':'오늘 운동의 전반적인 체감 강도는 어땠나요?',
 '오늘 운동한 느낌은?':'오늘 운동에 얼마나 만족하나요?',
 '가장 불편한 곳은 어떤 느낌이야?':'가장 불편한 부위의 느낌은 어떤가요?',
 '오늘은 회복하는 날. 운동 체크는 쉬어가자.':'휴식일에는 운동 항목을 기록하지 않아도 돼요.',
 '내일의 나에게, 작은 응원.':'다음의 나를 위한 한 가지.',
 '점수보다 중요한 건, 나를 믿어주는 마음이야.':'오늘의 경험을 바탕으로 다음에 해볼 행동을 골라보세요.',
 '다음에 해보고 싶은 한 가지':'다음에 실천하고 싶은 한 가지',
 '남기고 싶은 말이 있다면, 딱 한 줄':'남기고 싶은 생각 한 줄',
 '60자 이내 · 아무것도 쓰지 않아도 괜찮아.':'60자 이내 · 글을 쓰지 않아도 기록할 수 있어요.',
 '이만큼 나를 돌아봤네.':'오늘 돌아본 나의 모습',
 '자세히 고른 몸·마음 체크도 함께 저장할게.':'추가로 선택한 컨디션도 함께 저장돼요.',
 '마음과 하루 종류를 하나씩 골라줘.':'마음 상태와 활동 종류를 하나씩 선택해 주세요.',
 '몸 상태와 수면을 골라줘.':'몸 상태와 수면을 선택해 주세요.',
 '너의 속도대로, 천천히 해도 좋아.':'자신의 속도에 맞춰 기록해 주세요.',
 '오늘은 넘어갈게':'이 단계는 넘어가기',
 '오늘의 너를 잘 남겼어.':'오늘의 기록을 남겼어요.',
 '마음을 돌아본 것만으로도 충분해.':'자신의 상태를 알아차리는 것도 중요한 연습이에요.',
 '이 작은 기록이, 나중에 너를 응원해줄 거야.':'쌓인 기록을 통해 나의 변화와 강점을 발견해 보세요.',
 '다른 사람 말고, 어제의 나와 함께 자라고 있어.':'이전의 나와 비교하며 나만의 변화를 살펴보세요.',
 '힘든 날':'힘들어요','조금 지침':'지쳐 있어요','아주 좋아':'아주 좋아요',
 '푹 잤어요':'잘 잤어요','그저 그랬어요':'보통이었어요','뒤척였어요':'숙면이 어려웠어요',
 '거의 안 피곤해':'피로가 거의 없어요','조금 피곤해':'약간 피곤해요','많이 피곤해':'많이 피곤해요',
 '편안해':'편안해요','조금 신경 쓰여':'약간 신경 쓰여요','많이 부담돼':'부담이 커요',
 '조금 뻐근해':'약간 뻐근해요','많이 뻐근해':'많이 뻐근해요','잘 모르겠어':'잘 모르겠어요',
 '아주 가벼웠어':'매우 가벼웠어요','가벼웠어':'가벼웠어요','보통이었어':'보통이었어요','힘들었어':'힘들었어요','아주 힘들었어':'매우 힘들었어요',
 '아쉬웠어':'아쉬웠어요','괜찮았어':'괜찮았어요','뿌듯했어':'만족스러웠어요',
 '움직일 때 불편해':'움직일 때 불편해요','가만히 있어도 불편해':'쉬고 있어도 불편해요',
 '물을 챙겨 마셨어':'수분을 챙겼어요','끼니를 잘 챙겼어':'식사를 챙겼어요','가볍게 몸을 풀었어':'가볍게 몸을 풀었어요','충분히 쉬었어':'충분히 쉬었어요',
 '내 마음 말하기':'생각과 감정 표현하기','준비 하나 챙기기':'목표에 맞게 준비하기','나를 믿어주기':'스스로를 신뢰하기','푹 쉬어주기':'필요한 회복 챙기기',
 '예: 실수했지만 다시 공을 받으러 갔어':'예: 실수 후에도 다음 플레이에 다시 참여했다'
};
function applyAgeCopy(root,group){
 if(group!=='teen')return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;const text=node.nodeValue.trim();if(Object.hasOwn(TEEN_COPY,text))node.nodeValue=node.nodeValue.replace(text,TEEN_COPY[text]);}
 root.querySelectorAll('[placeholder]').forEach(el=>{if(TEEN_COPY[el.placeholder])el.placeholder=TEEN_COPY[el.placeholder];});
}
