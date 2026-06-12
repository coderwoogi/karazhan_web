# 디자인 테마 시스템 (Design Themes)

**레이아웃(구조)은 공통, 디자인(꾸밈)은 테마별로 완전 분리**된 구조입니다.
활성 테마 디렉토리만 바꾸면 사이트 전체 디자인이 통째로 교체됩니다.

```
frontend/src/App.css     ← 공통 구조 레이아웃 (배치/크기/간격/지오메트리만)  · 모든 테마 공용
frontend/src/index.css   ← 공통 베이스 (색은 var(--kz-*) 토큰 참조)          · 모든 테마 공용
themes/
  stormwind/             ← 얼라이언스 · 블루 (기본값) · 둥근 모서리
    theme.css            ← 이 테마의 "전체 디자인"(색·배경·테두리·그림자·그라데이션·폰트·애니메이션)
    hero.mp4             ← 메인 히어로 배경 영상
  orgrimmar/             ← 호드 · 레드/번트 · 각진 모서리 + 브론즈 금속 질감
    theme.css            ← 오그리마 전체 디자인 (자족적, 스톰윈드와 독립 관리)
    hero.mp4
```

## 핵심 원리

1. **공통 구조** — `App.css`(레이아웃)와 `index.css`(베이스)는 색을 직접 쓰지 않고
   `var(--kz-blue)`, `rgba(var(--kz-blue-rgb), …)` 처럼 **토큰만 참조**합니다.
2. **테마 디자인** — 각 `themes/<테마>/theme.css`가 그 테마의 색·꾸밈 **전부**를 소유합니다.
   토큰 값 정의 + 모든 장식 규칙(테두리/그림자/라운드/그라데이션/애니메이션)이 들어 있어,
   **두 테마를 서로 독립적으로 자유롭게 편집**할 수 있습니다. (스톰윈드 수정이 오그리마에 영향 없음)
3. **로딩** — 공통 CSS는 React 번들에, 테마 CSS는 **고정 경로 `/theme/theme.css`** 로 서빙됩니다.
   두 레이어는 항상 함께 로드되며, 토큰 정의가 테마 파일에만 있으므로 테마를 바꾸면 색이 통째로 바뀝니다.
   - `main.go`: `/theme/` → `./themes/<KARAZHAN_THEME>` (영상 `hero.mp4`도 동일 경로)
   - `App.jsx`: 히어로 `<source src="/theme/hero.mp4">`, 카운트다운 링 그라데이션도 토큰 사용
4. **활성 테마 선택** — `KARAZHAN_THEME` 환경변수 (미설정 시 `stormwind`) · `config.ThemeName()`

## 테마 전환

```powershell
$env:KARAZHAN_THEME = "orgrimmar"   # 호드(레드)
go run main.go
```
또는 `configs/database.env` 에 `KARAZHAN_THEME=orgrimmar`.
**서버만 재시작하면 됨 — React 재빌드 불필요** (테마 CSS는 런타임에 별도 로딩).

## 새 테마 추가

1. `themes/<이름>/` 생성 후 기존 테마의 `theme.css`를 복사
2. 상단 `:root{--kz-*}` 팔레트 값 교체 (토큰 **키는 그대로**)
3. 필요하면 파일 하단에 그 테마만의 장식 오버라이드 추가 (라운드/테두리/질감 등)
4. `hero.mp4` 배경 영상 추가
5. `KARAZHAN_THEME=<이름>` 으로 전환

### 토큰 목록 (`:root`)

| 토큰 | 용도 |
|------|------|
| `--kz-blue` / `--kz-blue-rgb` | 주 강조색 (rgb는 rgba 액센트용) |
| `--kz-blue-mid-rgb` / `--kz-blue-dark-rgb` / `--kz-blue-soft-rgb` | 중간/진한/옅은 톤 (테두리·그림자·글로우) |
| `--kz-blue-dark` | 진한 강조색 |
| `--kz-blue-soft` | 옅은 패널/배지 배경 |
| `--kz-ink` / `--kz-text` / `--kz-muted` | 제목 / 본문 / 보조 텍스트 |
| `--kz-line` | 테두리/구분선 |
| `--kz-gold` | 골드(오그리마=브론즈) |
| `--kz-shadow` | 그림자 |
| `--kz-btn-from` / `--kz-btn-to` | 기본 버튼 그라데이션 |
| `--kz-hero-from` / `--kz-hero-to` | 히어로/링 그라데이션 |
| `--kz-crest-from` / `--kz-crest-to` | 크레스트/엠블럼 그라데이션 |
| `--kz-accent-soft` | 거의 흰색 카드 배경 틴트 |
| `--kz-hero-overlay` | 히어로 영상 오버레이 |
| `--kz-bronze` / `--kz-bronze-dark` | (오그리마 전용) 금속 액센트 |

> 초록(성공)·시안(정보)·중립 회색 등 **의미 색상**은 진영과 무관하게 의도적으로 토큰화하지 않았습니다.

## 디자인 차별화 예 (오그리마)

스톰윈드의 부드러운 라이트(둥근 18~24px 모서리, 맑은 블루) 대비,
오그리마는 **각진 모서리(4~7px) · 철/가죽 두꺼운 테두리 · 브론즈 금속 버튼 엣지 ·
강한 그림자 · 엠버(웜) 라이트 배경**으로 호드 분위기를 냅니다. 모두 `theme.css` 하단 오버라이드에 정의.
