# 카라잔 홈 디자인 요소 리소스 목록

이 문서는 `karazhan-home-purple-citadel.html` 시안에 필요한 비주얼 요소를 분해한 목록입니다.
현재 세션에서는 이미지 생성 도구가 직접 노출되어 있지 않아, 실제 AI 생성 이미지 대신 기존 리소스와 CSS/SVG형 장식으로 대체 구현했습니다.
나중에 이미지 생성이 가능한 환경에서 아래 프롬프트를 기준으로 개별 리소스를 생성하면 HTML의 배경 경로만 교체할 수 있습니다.

## 핵심 리소스

| ID | 요소 | 현재 HTML 반영 방식 | 권장 생성 이미지 방향 |
| --- | --- | --- | --- |
| `hero-bg` | 메인 히어로 배경 | `./assets/karazhan-purple-web-bg.png` + 보라 안개 오버레이 + 성채 실루엣 CSS | 보랏빛 밤하늘, 고딕 성채, 마력 균열, 어두운 숲, 와이드 16:9 |
| `hero-left-figure` | 좌측 인물 분위기 | CSS 마법 구체와 그림자 레이어 | 어둠 속 로브 마법사 실루엣, 손에 보라색 마력 구체, 로고/문자 없음 |
| `hero-party` | 하단 모험가 실루엣 | CSS 실루엣 4개 | 전사/마법사/도적/사냥꾼 실루엣, 역광, 배경 투명 또는 어두운 톤 |
| `server-panel` | 서버 상태 패널 | 금장 테두리, 코너 장식, 보라 그라데이션 CSS | 어두운 판타지 금속 패널, 금장 모서리, 중앙 텍스트 영역 비워두기 |
| `challenge-trial` | 그림자 시련 카드 | `../img/shop_bg.jpg` + 어두운 오버레이 | 보라빛 던전 입구, 그림자 괴물 실루엣, 카드 배너형 |
| `challenge-enhance` | 장비 강화 카드 | `../img/carddraw.png` + 어두운 오버레이 | 마법 강화대, 보라색 룬, 장비 아이콘 배치 가능한 빈 영역 |
| `challenge-mission` | 보너스 미션 카드 | `../img/hearthstone-heroes-warcraft-2015-04-27.webp` + 어두운 오버레이 | 던전 전투 장면, 멀리 보스 실루엣, 금빛 보상 효과 |
| `notice-panel` | 공지/가이드 패널 | 반투명 검은 패널 + 금장 선 | 어두운 석재/금속 UI 프레임, 텍스트 영역 비워두기 |
| `media-panel` | 미디어 썸네일 | 기존 이미지 + 재생 버튼 CSS | 보라색 포털과 성채 장면, 영상 썸네일용 |
| `cta-bg` | 다운로드 CTA | `../img/notice_board.png` + 보라 오버레이 | 성문 앞 보라 포털, 중앙 하단 CTA 배치용 여백 |
| `divider` | 섹션 구분선 | CSS 금장 라인/다이아몬드 | 얇은 금속 장식선, 중앙 보석 장식, 가로형 |
| `button` | 버튼 질감 | CSS 보라 보석 그라데이션 | 보라색 마력 보석 버튼, 금장 테두리, 텍스트 없음 |

## 이미지 생성용 프롬프트 초안

### 메인 히어로 배경

```text
Use case: stylized-concept
Asset type: fantasy game landing page hero background
Primary request: original dark fantasy citadel scene inspired by a haunted magical tower, not copying any existing game artwork
Scene/backdrop: violet night sky, gothic castle silhouette, arcane mist, dark forest foreground
Composition/framing: ultra wide 16:9, castle on the right, enough darker negative space in the center for title text, subtle adventurer silhouettes near the bottom
Lighting/mood: dramatic purple moonlight, gold torch accents, ominous but premium
Color palette: black, deep violet, muted gold, cold blue shadows
Constraints: no logos, no readable text, no watermark, do not imitate official World of Warcraft artwork
```

### 서버 상태 패널

```text
Use case: stylized-concept
Asset type: fantasy UI panel texture
Primary request: ornate dark fantasy rectangular UI panel with gold metal corners and violet magical inner glow
Composition/framing: centered panel frame, empty middle area for HTML text
Materials/textures: aged black iron, brushed gold trim, faint purple rune glow
Constraints: no text, no logo, no watermark, clean edges suitable for web UI
```

### 도전 카드 배경

```text
Use case: stylized-concept
Asset type: web feature card background
Primary request: dark fantasy dungeon challenge banner with purple magical atmosphere
Composition/framing: 3:1 horizontal card, subject slightly right, left side darker for title text
Lighting/mood: smoky, high contrast, premium game launcher style
Constraints: no text, no logo, no watermark
```

## HTML 적용 메모

- 현재 시안 파일: `design-proposals/karazhan-home-purple-citadel.html`
- 현재 히어로 배경: `design-proposals/assets/karazhan-purple-web-bg.png`
- 실제 서비스 파일은 수정하지 않았습니다.
- 추후 생성 이미지가 준비되면 CSS의 `background` 경로만 교체하면 됩니다.
