# coding: utf-8
"""Apply MPS's score-review notice to the independently bundled report pages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'resources'


def replace_once(text, old, new):
    if new in text:
        return text
    if old not in text:
        raise ValueError('Report structure changed: ' + old[:80])
    return text.replace(old, new, 1)


def apply_report_notices():
    files = ['mentalguide/index.html', 'Mtest/index.html', '2026mental2/index.html',
             '2026mental2/MPS_멘탈포지션_A4_3페이지_리포트_v3.html']
    for name in files:
        path = ROOT / name
        text = path.read_text()
        assets = '<link rel="stylesheet" href="../report-score-notice.css"><script src="../report-score-notice.js"></script>'
        if assets not in text:
            text = replace_once(text, '</head>', assets + '</head>')
        if name == 'mentalguide/index.html':
            text = replace_once(text,
                'const contentContainer = document.getElementById(\'tier-content-container\');',
                "const contentContainer = document.getElementById('tier-content-container');\n            const scoreReview = MPS_SCORE_REVIEW.tierIncludesThreshold(tier.rawRange) ? MPS_SCORE_REVIEW.noticeHTML([], true) : '';" )
            text = replace_once(text,
                'contentContainer.innerHTML = `\n                    <div class="mb-6">',
                'contentContainer.innerHTML = `\n                    ${scoreReview}\n                    <div class="mb-6">')
        elif name == 'Mtest/index.html':
            text = replace_once(text, 'return { pcdeq, mgi, extra };',
                "const scoreReview = MPS_SCORE_REVIEW.highScores([...pcdeq, ...extra, { name: 'MGI 멘탈 성장지수', score: mgi }]);\n            return { pcdeq, mgi, extra, scoreReview };")
            text = replace_once(text,
                "data.extra.forEach(item => text += `- ${item.name}: ${item.score.toFixed(1)}\\n`);",
                "data.extra.forEach(item => text += `- ${item.name}: ${item.score.toFixed(1)}\\n`);\n               const scoreReviewText = MPS_SCORE_REVIEW.noticeText(data.scoreReview);\n               if (scoreReviewText) text += `\\n■ ${scoreReviewText}\\n`;")
            text = replace_once(text, '<div className="space-y-12">',
                '''<div className="space-y-12">
                              {data.scoreReview.length > 0 && (
                                  <aside className="mps-score-notice" aria-label={MPS_SCORE_REVIEW.title}>
                                      <strong>{MPS_SCORE_REVIEW.title}</strong>
                                      <p className="mps-score-notice-scores">해당 영역: {MPS_SCORE_REVIEW.formatScores(data.scoreReview)}</p>
                                      <p>{MPS_SCORE_REVIEW.message}</p>
                                      <small>{MPS_SCORE_REVIEW.basis}</small>
                                  </aside>
                              )}''')
        elif name == '2026mental2/index.html':
            text = replace_once(text, '<div class="chart-section"><div class="section-title"><h3>5대 지표,',
                '<div id="scoreReviewNotice" hidden></div><div class="chart-section"><div class="section-title"><h3>5대 지표,')
            text = replace_once(text, "text('mgi',fmt(a.mgi));const high=", "MPS_SCORE_REVIEW.renderNotice($('scoreReviewNotice'), [...Object.entries(a.raw).map(([name,score])=>({name,score})), {name:'종합 MGI',score:a.mgi}]);\n text('mgi',fmt(a.mgi));const high=")
        else:
            text = text.replace('Object.entries(a.raw || a.core)', 'Object.entries({...a.raw, ...a.core})')
            text = replace_once(text, '<div class="score-grid" id="scoreGrid"></div>',
                '<div id="scoreReviewNotice" hidden></div><div class="score-grid" id="scoreGrid"></div>')
            text = replace_once(text, 'function scoreStatus(v){\n',
                'function scoreStatus(v){\n  if(v>=5.5 && v<=6) return "높은 자기평가 · 추가 확인";\n')
            text = replace_once(text, 'el("scoreGrid").innerHTML=CORE_NAMES.map((name,i)=>{',
                'MPS_SCORE_REVIEW.renderNotice(el("scoreReviewNotice"), [...Object.entries({...a.raw, ...a.core}).map(([name,score])=>({name,score})), {name:"종합 MGI",score:a.mgi}]);\n  el("scoreGrid").innerHTML=CORE_NAMES.map((name,i)=>{')
        path.write_text(text)


if __name__ == '__main__':
    apply_report_notices()
