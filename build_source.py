# coding: utf-8
"""One-time extraction of the three Basecamp views; runtime is independent."""
from pathlib import Path
import re
import shutil

src = Path(__file__).resolve().parent.parent / 'mps_basecamp'
dest = Path(__file__).resolve().parent
for file in ['styles.css', 'typography.css', 'hq.css', 'guides.js']:
    shutil.copy2(src / file, dest / file)
(dest / 'assets').mkdir(exist_ok=True)
for file in ['mps-logo-black.png', 'PretendardVariable.woff2']:
    shutil.copy2(src / 'assets' / file, dest / 'assets' / file)
for folder in ['Mtest', 'mentalguide', '20260916 diary', 'haeonsports']:
    shutil.copytree(src / 'resources' / folder, dest / 'resources' / folder,
                    dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git', '.DS_Store', 'node_modules'))
contents = []
landing = dest / 'resources' / 'haeonsports' / 'indexmental.html'
landing.write_text(landing.read_text().replace(
    '흔들려도,<br>다시 <em>나의 플레이로.</em>',
    '멘탈은 원래<br><em>무너지라고 있는 겁니다.</em>').replace(
    'MPS Mental | 흔들려도, 다시 나의 플레이로.',
    'MPS Mental | 멘탈은 원래 무너지라고 있는 겁니다.'))
for page in ['mental', 'mental-diary', 'mental-evidence']:
    html = (src / (page + '.html')).read_text()
    content = html.split('<div class="content">', 1)[1].split('<footer>', 1)[0]
    if page == 'mental':
        content = content.replace('<th>선수명</th><th>상태</th><th>프로그램</th><th>소속기관</th><th>관리</th>', '<th>선수명 · 고유번호</th><th>상태</th><th>프로그램</th><th>소속기관</th><th>담당 코치</th><th>관리</th>')
        content = content.replace('선수 등록·수정에서 ‘멘탈 관리 대상’을 선택하세요. 기존 멘탈 프로그램 선수는 자동으로 포함됩니다.', '선수별 담당 코치와 프로그램을 등록하고 회차 기록을 이어갑니다.')
        content = content.replace('선수명을 누르면 소속 팀·클리닉·센터, 진행 프로그램과 연결 리포트를 새 창에서 확인합니다.', '선수명을 누르면 회차별 차팅과 공유 다이어리를 확인합니다.')
        content = content.replace('<section class="section" id="">', '<section class="section" id="weekly">').replace('10명씩 표시합니다.', '목록에 표시합니다.')
        content = content.replace('<div class="resource-actions"><a class="primary" href="calendar.html?kind=mental">멘토링 예약 →</a><a class="button" href="forms.html?kind=mental">멘토 운영 서식 →</a></div>', '<div class="resource-actions"><a class="primary" href="../mps-res/index.html" target="_blank" rel="noopener">멘토링 예약 →</a><button class="button" data-add-player>+ 선수 등록</button><button class="button" id="import-basecamp">베이스캠프 기록 가져오기</button></div>')
    else:
        for name in re.findall(r'id="([^"]+)"', content):
            content = content.replace('id="' + name + '"', 'id="' + page + '-' + name + '"').replace('href="#' + name + '"', 'href="#' + page + '-' + name + '"')
    content = re.sub(r'href="mental\.html(?:#([^"]*))?"', lambda m: 'href="#' + (m.group(1) or 'mental') + '"', content)
    content = content.replace('href="mental-diary.html"', 'href="#mental-diary"').replace('href="mental-evidence.html"', 'href="#mental-evidence"')
    contents.append('<div class="content view" id="' + page + '" ' + ('hidden' if page != 'mental' else '') + '>' + content + '</div>')
shell = (dest / 'shell.html').read_text()
(dest / 'index.html').write_text(shell.replace('<!-- BASECAMP VIEWS -->', ''.join(contents)))
from prepare_diary import apply_diary_bridge
apply_diary_bridge()
from prepare_reports import apply_report_notices
apply_report_notices()
