# Karazhan - World of Warcraft Server Management Platform

## Architecture Overview

This is a unified Go web application for managing a WoW (AzerothCore) private server. It consists of multiple service modules under `pkg/`, each handling a specific domain:

- **auth**: User login/registration using WoW SRP6 authentication, session management via `session_user` cookie
- **home**: Dashboard with protected routes (redirects to `/` if not authenticated)
- **launcher**: Remote server process management (start/stop worldserver.exe/authserver.exe), log streaming, and scheduled tasks
- **stats**: Admin analytics and monitoring (accounts, characters, logs, permissions)
- **update**: File distribution system with MD5 checksums for game client updates
- **inspect**: CLI utility for DB schema inspection (run with `--inspect` flag)

The main server runs on port 8080, proxies `/work/*` to Apache on port 80, and serves static files from `pkg/{service}/static/`.

## Database Architecture

**Critical**: This project connects to **3 separate AzerothCore databases**:
- `acore_auth`: User accounts, bans, permissions (`account`, `account_access`, `account_banned`)
- `acore_characters`: Character data, items, logs
- `acore_world`: Item templates, localization (`item_template`, `item_template_locale`)

Queries frequently join across databases using `acore_auth.account`, `acore_characters.characters`, etc.

**External DB**: Remote MySQL at `121.148.127.135` for logs (`update.buttonlogs`) and scheduled tasks (`update.schedule`).

## Authentication & Authorization

- **Session**: Cookie `session_user` stores username (not encrypted, `HttpOnly: false`)
- **Admin Check**: User is admin if exists in `account_access` table (GM level ≥ 1)
- **Menu Permissions**: Fine-grained access via `web_menu_permissions` table (maps `menu_id` to `min_gmlevel`)
  - Use `CheckMenuPermission(w, r, "menu_id")` in stats handlers before granting access
  - Returns 403 if user lacks permission
- **Logging**: All admin actions logged to remote DB via `utils.LogAction(r, username, "action")`

## Key Patterns

### Service Registration
Each `pkg/{service}/service.go` exports `RegisterRoutes(mux)` called from `main.go`:
```go
func RegisterRoutes(mux *http.ServeMux) {
    mux.HandleFunc("/api/...", handler)
}
```

### Database Connections
- **No connection pooling**: Each handler opens/closes DB per request
- **Hardcoded credentials**: DSN strings inline (`root:4618@tcp(localhost:3306)/acore_auth`)
- Always defer `db.Close()`

### Frontend Integration
- Static HTML/CSS/JS in `pkg/{service}/static/`
- APIs return JSON, frontend uses `fetch()`
- Korean language strings in error messages (e.g., `"아이디와 비밀번호를 입력해주세요"`)

### Process Management (Launcher)
- Uses `tasklist /FI "IMAGENAME eq {name}"` to check if servers are running
- Starts processes with `CREATE_NEW_PROCESS_GROUP` flag for Windows
- Keeps `Stdin` pipe open to prevent server shutdown on EOF
- Real-time log streaming via Server-Sent Events (`text/event-stream`)

### Scheduler
- Polls `update.schedule` table every 20 seconds for tasks where `date <= NOW()` and `processed = 0`
- Executes `start`/`stop`/`restart` actions on auth/world servers
- Marks jobs as processed after execution

## Development Workflow

**Run server**: `go run main.go` (starts on port 8080)
**DB inspection**: `go run main.go --inspect` (prints table schemas)
**Dependencies**: Only `github.com/go-sql-driver/mysql` (Go 1.25+)

**Note**: Separate `launcher/` directory has its own `go.mod` (likely for standalone launcher builds).

## Common Tasks

### Adding a new API endpoint
1. Create handler in `pkg/{service}/{name}_handler.go`
2. Register route in `RegisterRoutes()` in `pkg/{service}/service.go`
3. Add permission check if admin-only: `CheckMenuPermission(w, r, "menu_id")`
4. Log action: `utils.LogAction(r, username, "ButtonName")`

### Working with items
- Join `acore_world.item_template` for English names
- Join `acore_world.item_template_locale` with `locale = 'koKR'` for Korean names
- Use `COALESCE(itl.Name, it.name)` to fallback to English if Korean missing
- Icon proxy: `/api/external/item_icon?entry={id}` fetches icons from wotlkdb.com

### Permission system
- Add menu to `web_menu_permissions` table (menu_id, min_gmlevel, description)
- Check access: `CheckMenuPermission(w, r, "menu_id")`
- Update permissions via `/api/admin/menus/update` (GM level 3+ only)

## External Dependencies
- **Apache/PHP**: Runs on port 80, handles `/work/*` routes (proxied)
- **wotlkdb.com**: External item icon CDN (cached in-memory after first fetch)
- **Windows**: Process management uses `tasklist`, `syscall.CREATE_NEW_PROCESS_GROUP`
