# Repository Rules

## Git Workflow
- 이 저장소에서는 작업 완료 후 결과 검증이 끝나면 `tools/git-autopush.ps1`로 커밋과 푸시를 진행합니다.
- 기본 명령:
  - `powershell -ExecutionPolicy Bypass -File tools/git-autopush.ps1 -Message "작업 요약"`
- 사용자가 커밋/푸시를 원하지 않는다고 명시한 경우에는 실행하지 않습니다.
- 커밋 메시지는 작업 내용을 짧고 명확하게 적습니다.

## Safety
- 커밋 전 최소한의 문법/빌드 검증을 먼저 수행합니다.
- 민감정보나 불필요한 산출물이 새로 생기면 먼저 `.gitignore` 반영 여부를 확인합니다.
