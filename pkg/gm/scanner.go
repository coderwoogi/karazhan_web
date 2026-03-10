package gm

import (
	"bufio"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type ModuleInfo struct {
	Name         string                 `json:"name"`
	Path         string                 `json:"path"`
	Description  string                 `json:"description"`
	SQLFiles     []string               `json:"sql_files"`
	FileTree     *FileNode              `json:"file_tree"`
	TableDefs    []string               `json:"table_defs"`
	Databases    []string               `json:"databases"`
	TableInfos   []ModuleTableInfo      `json:"table_infos"`
	CommandInfos []ModuleCommandInfo    `json:"command_infos"`
	SourceFiles  []string               `json:"source_files"`
	Meta         map[string]interface{} `json:"meta"`
}

type ModuleTableInfo struct {
	Database string `json:"database"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Desc     string `json:"desc"`
	Detail   string `json:"detail"`
	Source   string `json:"source"`
}

type ModuleCommandInfo struct {
	Environment string `json:"environment"`
	Command     string `json:"command"`
	Type        string `json:"type"`
	Desc        string `json:"desc"`
	Detail      string `json:"detail"`
	Source      string `json:"source"`
}

type FileNode struct {
	Name     string      `json:"name"`
	Type     string      `json:"type"`
	Children []*FileNode `json:"children,omitempty"`
}

type commandCandidate struct {
	Command  string
	Security string
	Source   string
}

type chatCommandEntry struct {
	Token    string
	Ref      string
	Security string
}

func ScanModules(rootDir string) ([]*ModuleInfo, error) {
	entries, err := os.ReadDir(rootDir)
	if err != nil {
		return nil, err
	}

	var modules []*ModuleInfo
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "mod-") {
			continue
		}

		modPath := filepath.Join(rootDir, entry.Name())
		info := scanSingleModule(modPath, entry.Name())
		modules = append(modules, info)
	}

	sort.Slice(modules, func(i, j int) bool {
		return modules[i].Name < modules[j].Name
	})
	return modules, nil
}

func scanSingleModule(modPath, moduleName string) *ModuleInfo {
	fileTree, sqlFiles, tableDefs := scanModuleDir(modPath)
	sourceFiles := collectSourceFiles(modPath)
	tableInfos, commandInfos, dbs := analyzeModuleArtifacts(modPath, sqlFiles, sourceFiles)

	return &ModuleInfo{
		Name:         moduleName,
		Path:         modPath,
		Description:  extractDescription(modPath),
		SQLFiles:     sqlFiles,
		FileTree:     fileTree,
		TableDefs:    tableDefs,
		Databases:    dbs,
		TableInfos:   tableInfos,
		CommandInfos: commandInfos,
		SourceFiles:  sourceFiles,
		Meta: map[string]interface{}{
			"tableCount":   len(tableInfos),
			"commandCount": len(commandInfos),
			"sourceCount":  len(sourceFiles),
			"sqlCount":     len(sqlFiles),
		},
	}
}

func scanModuleDir(path string) (*FileNode, []string, []string) {
	return buildTreeRecursive(path)
}

func buildTreeRecursive(path string) (*FileNode, []string, []string) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return &FileNode{Name: filepath.Base(path), Type: "error"}, nil, nil
	}

	node := &FileNode{Name: filepath.Base(path), Type: "dir"}
	var sqlFiles []string
	var tableDefs []string

	for _, entry := range entries {
		fullPath := filepath.Join(path, entry.Name())
		if entry.IsDir() {
			if entry.Name() == ".git" || entry.Name() == ".github" || entry.Name() == ".vs" {
				continue
			}
			childNode, childSQL, childDefs := buildTreeRecursive(fullPath)
			node.Children = append(node.Children, childNode)
			sqlFiles = append(sqlFiles, childSQL...)
			tableDefs = append(tableDefs, childDefs...)
			continue
		}

		node.Children = append(node.Children, &FileNode{Name: entry.Name(), Type: "file"})
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".sql") {
			sqlFiles = append(sqlFiles, fullPath)
			tableDefs = append(tableDefs, extractCreateTables(fullPath)...)
		}
	}

	sort.Slice(node.Children, func(i, j int) bool {
		if node.Children[i].Type == node.Children[j].Type {
			return node.Children[i].Name < node.Children[j].Name
		}
		return node.Children[i].Type == "dir"
	})
	sort.Strings(sqlFiles)
	return node, sqlFiles, tableDefs
}

func extractDescription(modPath string) string {
	readmes := []string{"README.md", "readme.md", "Readme.md", ".github\\README.md"}
	for _, name := range readmes {
		readmePath := filepath.Join(modPath, filepath.FromSlash(name))
		content, err := os.ReadFile(readmePath)
		if err != nil {
			continue
		}
		lines := strings.Split(string(content), "\n")
		for _, raw := range lines {
			line := strings.TrimSpace(raw)
			if line == "" {
				continue
			}
			if strings.HasPrefix(line, "#") || strings.HasPrefix(line, "![") || strings.HasPrefix(line, "[!") {
				continue
			}
			line = strings.Trim(line, "`")
			if len(line) > 220 {
				line = line[:220] + "..."
			}
			return line
		}
	}

	confDir := filepath.Join(modPath, "conf")
	entries, err := os.ReadDir(confDir)
	if err != nil {
		return "설명 정보가 없습니다."
	}
	for _, entry := range entries {
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".conf.dist") {
			continue
		}
		f, err := os.Open(filepath.Join(confDir, entry.Name()))
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if !strings.HasPrefix(line, "#") {
				continue
			}
			line = strings.TrimSpace(strings.TrimPrefix(line, "#"))
			if line == "" || strings.HasPrefix(strings.ToLower(line), "config file for") {
				continue
			}
			f.Close()
			return line
		}
		f.Close()
	}

	return "설명 정보가 없습니다."
}

func extractCreateTables(filePath string) []string {
	file, err := os.Open(filePath)
	if err != nil {
		return nil
	}
	defer file.Close()

	var defs []string
	var buf strings.Builder
	inCreate := false
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		upper := strings.ToUpper(strings.TrimSpace(line))
		if strings.HasPrefix(upper, "CREATE TABLE") {
			inCreate = true
		}
		if !inCreate {
			continue
		}
		buf.WriteString(line)
		buf.WriteByte('\n')
		if strings.Contains(line, ";") {
			defs = append(defs, buf.String())
			buf.Reset()
			inCreate = false
		}
	}

	return defs
}

func collectSourceFiles(modPath string) []string {
	var files []string
	filepath.WalkDir(modPath, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d == nil || d.IsDir() {
			return nil
		}
		switch strings.ToLower(filepath.Ext(d.Name())) {
		case ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".cs":
			files = append(files, p)
		}
		return nil
	})
	sort.Strings(files)
	return files
}

func analyzeModuleArtifacts(modPath string, sqlFiles []string, sourceFiles []string) ([]ModuleTableInfo, []ModuleCommandInfo, []string) {
	tableMap := map[string]ModuleTableInfo{}
	commandMap := map[string]ModuleCommandInfo{}
	dbSet := map[string]struct{}{}

	for _, sqlFile := range sqlFiles {
		dbName := inferDatabaseFromPath(sqlFile)
		if dbName != "" {
			dbSet[dbName] = struct{}{}
		}
		for _, tableName := range extractTableNamesFromSQL(sqlFile) {
			key := dbName + "|" + tableName
			if _, exists := tableMap[key]; exists {
				continue
			}
			tableMap[key] = ModuleTableInfo{
				Database: dbName,
				Name:     tableName,
				Type:     "Table",
				Desc:     inferTableDescription(tableName, filepath.Base(modPath)),
				Detail:   inferTableDetail(sqlFile, tableName),
				Source:   sqlFile,
			}
		}
	}

	for _, src := range sourceFiles {
		contentBytes, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		content := string(contentBytes)

		for _, dbName := range inferDatabasesFromSource(content) {
			dbSet[dbName] = struct{}{}
		}

		for _, tbl := range extractTableNamesFromQuerySource(content) {
			dbName := inferDBForTableFromSource(content)
			if dbName != "" {
				dbSet[dbName] = struct{}{}
			}
			if dbName == "" && hasNamedTable(tableMap, tbl) {
				continue
			}
			key := dbName + "|" + tbl
			if _, exists := tableMap[key]; exists {
				continue
			}
			tableMap[key] = ModuleTableInfo{
				Database: dbName,
				Name:     tbl,
				Type:     "Table",
				Desc:     inferTableDescription(tbl, filepath.Base(modPath)),
				Detail:   "소스 코드의 SQL 쿼리에서 참조되는 테이블입니다.",
				Source:   src,
			}
		}

		for _, candidate := range extractCommandsFromSource(content, src) {
			key := candidate.Command + "|" + candidate.Source
			if _, exists := commandMap[key]; exists {
				continue
			}
			commandMap[key] = ModuleCommandInfo{
				Environment: "worldserver",
				Command:     candidate.Command,
				Type:        "Command",
				Desc:        inferCommandDescription(candidate.Command, filepath.Base(modPath)),
				Detail:      inferCommandDetail(candidate.Security),
				Source:      candidate.Source,
			}
		}
	}

	tables := make([]ModuleTableInfo, 0, len(tableMap))
	for _, v := range tableMap {
		tables = append(tables, v)
	}
	sort.Slice(tables, func(i, j int) bool {
		if tables[i].Database == tables[j].Database {
			return tables[i].Name < tables[j].Name
		}
		return tables[i].Database < tables[j].Database
	})

	commands := make([]ModuleCommandInfo, 0, len(commandMap))
	for _, v := range commandMap {
		commands = append(commands, v)
	}
	sort.Slice(commands, func(i, j int) bool {
		if commands[i].Command == commands[j].Command {
			return commands[i].Source < commands[j].Source
		}
		return commands[i].Command < commands[j].Command
	})

	dbs := make([]string, 0, len(dbSet))
	for dbName := range dbSet {
		if strings.TrimSpace(dbName) == "" {
			continue
		}
		dbs = append(dbs, dbName)
	}
	sort.Strings(dbs)

	return tables, commands, dbs
}

func inferDatabaseFromPath(path string) string {
	lower := strings.ToLower(path)
	switch {
	case strings.Contains(lower, "db-world"), strings.Contains(lower, `\world\`), strings.Contains(lower, "/world/"):
		return "acore_world"
	case strings.Contains(lower, "db-characters"), strings.Contains(lower, `\characters\`), strings.Contains(lower, "/characters/"):
		return "acore_characters"
	case strings.Contains(lower, "db-auth"), strings.Contains(lower, `\auth\`), strings.Contains(lower, "/auth/"):
		return "acore_auth"
	default:
		return ""
	}
}

func extractTableNamesFromSQL(filePath string) []string {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	re := regexp.MustCompile("(?im)(?:^|;)\\s*(?:CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|INSERT\\s+INTO|ALTER\\s+TABLE|REPLACE\\s+INTO|UPDATE)\\s+`?([a-zA-Z0-9_]+)`?")
	matches := re.FindAllStringSubmatch(string(content), -1)
	seen := map[string]struct{}{}
	var out []string
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		name := strings.TrimSpace(m[1])
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func extractTableNamesFromQuerySource(content string) []string {
	queryRe := regexp.MustCompile(`(?is)(?:Query|PQuery|Execute|DirectExecute|QueryResult)\s*\(\s*"([^"\r\n]+)"`)
	tableRe := regexp.MustCompile("(?is)(?:FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+`?([a-zA-Z0-9_]+)`?")
	seen := map[string]struct{}{}
	var out []string
	for _, query := range queryRe.FindAllStringSubmatch(content, -1) {
		if len(query) < 2 {
			continue
		}
		for _, match := range tableRe.FindAllStringSubmatch(query[1], -1) {
			if len(match) < 2 {
				continue
			}
			name := strings.TrimSpace(match[1])
			if name == "" || len(name) < 3 {
				continue
			}
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

func inferDatabasesFromSource(content string) []string {
	dbSet := map[string]struct{}{}
	lower := strings.ToLower(content)
	if strings.Contains(lower, "worlddatabase") {
		dbSet["acore_world"] = struct{}{}
	}
	if strings.Contains(lower, "characterdatabase") {
		dbSet["acore_characters"] = struct{}{}
	}
	if strings.Contains(lower, "logindatabase") || strings.Contains(lower, "authdatabase") {
		dbSet["acore_auth"] = struct{}{}
	}
	var out []string
	for v := range dbSet {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

func inferDBForTableFromSource(content string) string {
	dbs := inferDatabasesFromSource(content)
	if len(dbs) == 1 {
		return dbs[0]
	}
	return ""
}

func extractCommandsFromSource(content, source string) []commandCandidate {
	tableMap := parseChatCommandTables(content)
	candidates := expandChatCommandTable(tableMap, source)

	seen := map[string]struct{}{}
	var out []commandCandidate
	for _, candidate := range candidates {
		cmd := normalizeCommand(candidate.Command)
		if cmd == "" {
			continue
		}
		key := cmd + "|" + candidate.Source
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		candidate.Command = cmd
		out = append(out, candidate)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].Command < out[j].Command
	})
	return out
}

func parseChatCommandTables(content string) map[string][]chatCommandEntry {
	lines := strings.Split(content, "\n")
	startRe := regexp.MustCompile(`static\s+ChatCommandTable\s+([A-Za-z0-9_]+)\s*=`) 
	entryRe := regexp.MustCompile(`\{\s*"([^"]*)"\s*,\s*([A-Za-z0-9_]+)`)
	secRe := regexp.MustCompile(`SEC_[A-Z_]+`)

	tables := map[string][]chatCommandEntry{}
	current := ""
	depth := 0

	for _, line := range lines {
		if current == "" {
			if m := startRe.FindStringSubmatch(line); len(m) == 2 {
				current = m[1]
				depth = strings.Count(line, "{") - strings.Count(line, "}")
			}
			continue
		}

		depth += strings.Count(line, "{")
		depth -= strings.Count(line, "}")

		if m := entryRe.FindStringSubmatch(line); len(m) == 3 {
			security := ""
			if sec := secRe.FindString(line); sec != "" {
				security = sec
			}
			tables[current] = append(tables[current], chatCommandEntry{
				Token:    m[1],
				Ref:      m[2],
				Security: security,
			})
		}

		if depth <= 0 {
			current = ""
			depth = 0
		}
	}

	return tables
}

func expandChatCommandTable(tables map[string][]chatCommandEntry, source string) []commandCandidate {
	if len(tables) == 0 {
		return nil
	}

	referenced := map[string]struct{}{}
	for _, entries := range tables {
		for _, entry := range entries {
			if _, ok := tables[entry.Ref]; ok {
				referenced[entry.Ref] = struct{}{}
			}
		}
	}

	var roots []string
	for name := range tables {
		if _, ok := referenced[name]; !ok {
			roots = append(roots, name)
		}
	}
	if len(roots) == 0 {
		for name := range tables {
			roots = append(roots, name)
		}
	}
	sort.Strings(roots)

	var out []commandCandidate
	visited := map[string]bool{}
	var walk func(tableName string, prefix []string, inheritedSecurity string)
	walk = func(tableName string, prefix []string, inheritedSecurity string) {
		if visited[tableName] && len(prefix) == 0 {
			return
		}
		if len(prefix) == 0 {
			visited[tableName] = true
		}
		for _, entry := range tables[tableName] {
			parts := append([]string{}, prefix...)
			if token := strings.TrimSpace(entry.Token); token != "" {
				parts = append(parts, token)
			}
			security := inheritedSecurity
			if entry.Security != "" {
				security = entry.Security
			}
			if _, ok := tables[entry.Ref]; ok {
				walk(entry.Ref, parts, security)
				continue
			}
			if len(parts) == 0 {
				continue
			}
			out = append(out, commandCandidate{
				Command:  "." + strings.Join(parts, " "),
				Security: security,
				Source:   source,
			})
		}
	}

	for _, root := range roots {
		walk(root, nil, "")
	}
	return out
}

func normalizeCommand(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return ""
	}
	cmd = strings.Join(strings.Fields(cmd), " ")
	if !strings.HasPrefix(cmd, ".") {
		cmd = "." + cmd
	}
	return cmd
}

func hasNamedTable(tableMap map[string]ModuleTableInfo, name string) bool {
	for _, info := range tableMap {
		if strings.EqualFold(info.Name, name) {
			return true
		}
	}
	return false
}

func inferTableDescription(tableName, moduleName string) string {
	switch tableName {
	case "acore_cms_subscriptions":
		return "구독 또는 멤버십 레벨 정보를 저장하는 테이블입니다."
	case "custom_transmogrification":
		return "캐릭터 장비의 형상변환 적용 정보를 저장하는 테이블입니다."
	case "custom_transmogrification_sets":
		return "형상변환 세트 저장 정보입니다."
	case "custom_unlocked_appearances":
		return "잠금 해제된 외형 수집 정보를 저장합니다."
	case "blackmarket_purchase_log":
		return "암상인 구매 이력을 기록하는 로그 테이블입니다."
	}
	if strings.Contains(tableName, "log") {
		return "모듈 동작 이력이나 처리 결과를 기록하는 로그성 테이블입니다."
	}
	if strings.Contains(tableName, "state") {
		return "모듈의 현재 상태를 저장하는 상태 테이블입니다."
	}
	if strings.Contains(tableName, "pool") {
		return "랜덤 선택이나 후보 목록에 사용하는 풀 테이블입니다."
	}
	if strings.Contains(tableName, "spawn") {
		return "생성 위치 또는 스폰 정보를 저장하는 테이블입니다."
	}
	if strings.Contains(tableName, "reward") {
		return "보상 정보 또는 지급 상태를 보관하는 테이블입니다."
	}
	return moduleName + " 모듈이 참조하는 데이터 테이블입니다."
}

func inferTableDetail(filePath, tableName string) string {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return ""
	}
	re := regexp.MustCompile("(?is)CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`?" + regexp.QuoteMeta(tableName) + "`?\\s*\\((.*?)\\)\\s*[;)]")
	match := re.FindStringSubmatch(string(content))
	if len(match) < 2 {
		return "정의 파일을 직접 확인해 주세요."
	}
	lines := strings.Split(match[1], "\n")
	var cols []string
	for _, line := range lines {
		line = strings.TrimSpace(strings.TrimSuffix(line, ","))
		if line == "" {
			continue
		}
		upper := strings.ToUpper(line)
		if strings.HasPrefix(upper, "PRIMARY ") || strings.HasPrefix(upper, "KEY ") || strings.HasPrefix(upper, "INDEX ") || strings.HasPrefix(upper, "UNIQUE ") || strings.HasPrefix(upper, "CONSTRAINT ") {
			continue
		}
		if strings.HasPrefix(line, "`") {
			end := strings.Index(line[1:], "`")
			if end > 0 {
				cols = append(cols, line[1:1+end])
			}
		}
		if len(cols) >= 8 {
			break
		}
	}
	if len(cols) == 0 {
		return "정의 파일을 직접 확인해 주세요."
	}
	return "컬럼: " + strings.Join(cols, ", ")
}

func inferCommandDescription(cmd, moduleName string) string {
	switch {
	case strings.Contains(cmd, " tele add"):
		return "현재 위치를 모듈 대상 위치나 스폰 지점으로 등록합니다."
	case strings.HasSuffix(cmd, " enable"):
		return "모듈 기능을 활성화합니다."
	case strings.HasSuffix(cmd, " disable"):
		return "모듈 기능을 비활성화합니다."
	case strings.HasSuffix(cmd, " toggle"):
		return "모듈 활성 상태를 전환합니다."
	case strings.HasSuffix(cmd, " status"):
		return "현재 상태를 확인합니다."
	case strings.HasSuffix(cmd, " reload"):
		return "설정 또는 데이터를 다시 불러옵니다."
	case strings.Contains(cmd, " update"):
		return "모듈 관련 상태를 갱신하거나 변경합니다."
	case strings.Contains(cmd, " info"):
		return "모듈 관련 정보를 출력합니다."
	case strings.Contains(cmd, " sync"):
		return "클라이언트 또는 서버 데이터를 동기화합니다."
	case strings.Contains(cmd, " portable"):
		return "휴대형 기능을 실행하거나 토글합니다."
	case strings.Contains(cmd, " interface"):
		return "인터페이스 관련 옵션을 조정합니다."
	case strings.Contains(cmd, " add"):
		return "모듈 데이터나 대상을 추가합니다."
	case strings.HasSuffix(cmd, " go"):
		return "모듈이 관리하는 위치로 이동합니다."
	default:
		return moduleName + " 모듈에서 제공하는 명령어입니다."
	}
}

func inferCommandDetail(security string) string {
	switch security {
	case "SEC_ADMINISTRATOR":
		return "권한: 관리자"
	case "SEC_GAMEMASTER":
		return "권한: GM"
	case "SEC_MODERATOR":
		return "권한: 운영자"
	case "SEC_PLAYER":
		return "권한: 일반 플레이어"
	case "":
		return "권한 정보는 소스 코드를 직접 확인해 주세요."
	default:
		return "권한: " + security
	}
}
