# Repository Rules

## Priority
- 모든 작업 시작 전 이 `AGENTS.md` 규칙을 먼저 확인하고, 사용자 요청보다 우선 적용 가능한 항목은 먼저 반영합니다.

## Encoding
- 화면에 출력되는 텍스트를 추가/수정할 때는 한글이 깨지지 않도록 주의합니다.
- 문자열 치환, 파일 저장, 패치 적용 후 한글 표시가 깨질 가능성이 있는 파일은 다시 점검합니다.

## Complex Work
- 복잡성이 높은 작업을 시작할 때는 관련 파일을 임시 백업본으로 압축 또는 별도 보관 후 진행합니다.
- 임시 보관본은 복구 목적이며, 작업 완료 후 유지 여부를 판단합니다.

## Git Workflow
- 이 저장소에서는 작업 완료 후 결과 검증이 끝나면 `tools/git-autopush.ps1`로 커밋과 푸시를 진행합니다.
- 기본 명령:
  - `powershell -ExecutionPolicy Bypass -File tools/git-autopush.ps1 -Message "작업 요약"`
- 사용자가 커밋/푸시를 원하지 않는다고 명시한 경우에는 실행하지 않습니다.
- 작업 완료 후에는 [https://github.com/coderwoogi/karazhan_web](https://github.com/coderwoogi/karazhan_web) 에 작업 내용이 드러나는 커밋 메시지로 커밋합니다.
- 커밋 메시지는 작업 내용을 짧고 명확하게 적습니다.

## Safety
- 커밋 전 최소한의 문법/빌드 검증을 먼저 수행합니다.
- 민감정보나 불필요한 산출물이 새로 생기면 먼저 `.gitignore` 반영 여부를 확인합니다.
