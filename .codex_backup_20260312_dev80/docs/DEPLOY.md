# Karazhan Deploy Guide

## 목표
- 개발은 Windows에서 진행합니다.
- 운영은 macOS에서 `git pull -> build -> restart`만 수행합니다.
- 코드 안에는 DSN, 비밀번호, IP를 하드코딩하지 않습니다.

## 필수 환경 파일
- 운영 서버와 개발 서버 모두 저장소 루트의 `configs/database.env`를 사용합니다.
- 예시는 `configs/database.env.example`를 참고합니다.

예시:
```env
APP_ENV=production
PORT=80
KARAZHAN_DEV_DOMAIN=karazhandev.kro.kr
KARAZHAN_PROD_DOMAIN=karazhan.kro.kr
KARAZHAN_AUTH_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_auth
KARAZHAN_CHARACTERS_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_characters
KARAZHAN_WORLD_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_world
KARAZHAN_UPDATE_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/update
```

개발 예시:
```env
APP_ENV=development
PORT=8080
KARAZHAN_DEV_DOMAIN=karazhandev.kro.kr
KARAZHAN_PROD_DOMAIN=karazhan.kro.kr
KARAZHAN_AUTH_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_auth
KARAZHAN_CHARACTERS_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_characters
KARAZHAN_WORLD_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/acore_world
KARAZHAN_UPDATE_DSN=dbuser:dbpass@tcp(127.0.0.1:3306)/update
```

## 운영 배포 절차
도메인 규칙:
- 개발 서버: `karazhandev.kro.kr`
- 운영 서버: `karazhan.kro.kr`
- `APP_ENV`가 비어 있어도 요청 Host 기준으로 개발/운영을 판별합니다.

운영 서버에서는 아래 명령만 실행합니다.

```bash
bash scripts/deploy_prod_mac.sh
```

스크립트가 수행하는 작업:
1. `git pull --ff-only`
2. 금지 패턴 검사
3. `go build -o karazhan_server main.go`
4. 기존 바이너리 백업
5. 새 바이너리 교체
6. `launchctl kickstart -k gui/$(id -u)/com.karazhan.server`
7. 헬스 체크

실패 시:
- 기존 바이너리로 롤백합니다.
- 서비스도 다시 재시작합니다.

## 금지 사항
- 코드에 DSN 하드코딩 금지
- 코드에 DB 비밀번호/IP 하드코딩 금지
- 운영 서버에서 수동으로 소스 수정 금지

## 검증 명령
```bash
bash scripts/check_no_dev_secrets.sh
GOOS=darwin GOARCH=arm64 go build -o karazhan_server main.go
```
