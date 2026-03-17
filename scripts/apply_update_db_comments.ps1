$ErrorActionPreference = 'Stop'

function Get-UpdateDsn {
    $envPath = 'E:\xampp\htdocs\karazhan\configs\database.env'
    if (-not (Test-Path $envPath)) {
        throw "database.env 파일을 찾을 수 없습니다: $envPath"
    }
    $line = Get-Content -Path $envPath -Encoding UTF8 | Where-Object { $_ -match '^KARAZHAN_UPDATE_DSN=' } | Select-Object -First 1
    if (-not $line) {
        throw 'KARAZHAN_UPDATE_DSN 값을 찾지 못했습니다.'
    }
    return ($line -split '=', 2)[1].Trim()
}

function Parse-Dsn([string]$dsn) {
    if ($dsn -notmatch '^(?<user>[^:]+):(?<pass>[^@]+)@tcp\((?<host>[^:]+):(?<port>\d+)\)/(?<db>[^?]+)') {
        throw "지원하지 않는 DSN 형식입니다: $dsn"
    }
    return @{
        User = $matches.user
        Password = $matches.pass
        Host = $matches.host
        Port = $matches.port
        Database = $matches.db
    }
}

function Get-MySqlExe {
    $cmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }
    $fallback = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe'
    if (Test-Path $fallback) {
        return $fallback
    }
    throw 'mysql.exe를 찾지 못했습니다.'
}

function Invoke-MySqlQuery {
    param(
        [string]$Query,
        [switch]$SkipColumnNames
    )

    $dsn = Parse-Dsn (Get-UpdateDsn)
    $mysqlExe = Get-MySqlExe
    $args = @(
        "--default-character-set=utf8mb4",
        "--user=$($dsn.User)",
        "--password=$($dsn.Password)",
        "--host=$($dsn.Host)",
        "--port=$($dsn.Port)",
        "--database=$($dsn.Database)"
    )
    if ($SkipColumnNames) {
        $args += '--batch'
        $args += '--raw'
        $args += '--skip-column-names'
    }
    $args += '-e'
    $args += $Query
    & $mysqlExe @args
}

function Escape-SqlString([string]$value) {
    return ($value -replace "'", "''")
}

function Get-CharsetClause([string]$collation) {
    if ([string]::IsNullOrWhiteSpace($collation) -or $collation -eq 'NULL') {
        return ''
    }
    $charset = $collation.Split('_')[0]
    if ([string]::IsNullOrWhiteSpace($charset)) {
        return ''
    }
    return " CHARACTER SET $charset COLLATE $collation"
}

function Get-DefaultClause($defaultValue, [string]$type, [string]$isNullable) {
    if ($null -eq $defaultValue -or $defaultValue -eq 'NULL') {
        return ''
    }

    $normalized = [string]$defaultValue
    if ($normalized -match '^(?i:current_timestamp(\(\))?)$') {
        return ' DEFAULT CURRENT_TIMESTAMP'
    }
    if ($normalized -match '^(?i:null)$' -and $isNullable -eq 'YES') {
        return ' DEFAULT NULL'
    }

    $lowerType = $type.ToLowerInvariant()
    $isNumeric = $lowerType -match '^(tinyint|smallint|mediumint|int|bigint|decimal|double|float|bit)'
    if ($isNumeric) {
        return " DEFAULT $normalized"
    }

    return " DEFAULT '" + (Escape-SqlString $normalized) + "'"
}

function Get-ExtraClause([string]$extra) {
    if ([string]::IsNullOrWhiteSpace($extra) -or $extra -eq 'NULL') {
        return ''
    }
    $extraLower = $extra.ToLowerInvariant()
    $parts = @()
    if ($extraLower -match 'auto_increment') {
        $parts += 'AUTO_INCREMENT'
    }
    if ($extraLower -match 'on update current_timestamp') {
        $parts += 'ON UPDATE CURRENT_TIMESTAMP'
    }
    return ($parts -join ' ')
}

$tableComments = @{
    'carddraw_draw_logs' = '카드뽑기 보상 획득 이력'
    'gm_memos' = 'GM 메모 관리'
    'gm_module_info' = 'GM 모듈 분석 정보'
    'gm_todos' = 'GM 업무 일정'
    'home_sliders' = '홈 슬라이더 이미지'
    'launcher' = '런처 버전 정보'
    'launcher_announce_history' = '인게임 공지 전송 이력'
    'logs' = '웹 관리자 활동 로그'
    'notifications' = '웹 알림 보관함'
    'point_coin_market_listings' = '코인시장 판매 등록 목록'
    'point_shop_items' = '선술집 상품 정보'
    'point_shop_order_logs' = '선술집 주문 처리 이력'
    'point_shop_orders' = '선술집 주문 정보'
    'schedule' = '서버 일정 처리 내역'
    'server_events' = '서버 캘린더 일정'
    'update' = '업데이트 파일 정보'
    'update_source_urls' = '업데이트 비교 URL 설정'
    'user_point_logs' = '유저 포인트 변동 이력'
    'user_points' = '유저 포인트 보유 정보'
    'user_profiles' = '웹 유저 프로필 정보'
    'web_attachments' = '게시글 첨부파일 정보'
    'web_board_sequences' = '게시판 표시 번호 시퀀스'
    'web_boards' = '게시판 설정'
    'web_carddraw_items' = '카드뽑기 보상 품목'
    'web_comments' = '게시글 댓글'
    'web_feature_subscriptions' = '기능 상품 구독 정보'
    'web_inquiry_messages' = '문의 답변 메시지'
    'web_menu_registry' = '웹 메뉴 레지스트리'
    'web_post_views' = '게시글 조회 기록'
    'web_posts' = '게시글 본문'
    'web_promotion_links' = '홍보 게시글 URL 목록'
    'web_promotion_reward_config' = '홍보 보상 설정'
    'web_promotion_reward_log' = '홍보 보상 지급 이력'
    'web_promotion_verify_config' = '홍보 검수 기준 설정'
    'web_role_permissions' = '웹 권한 설정'
    'web_second_account_purchases' = '2계정 구매 이력'
    'wowpass_draw_logs' = '와우패스 뽑기 이력'
}

$columnComments = @{
    'id' = '고유 번호'
    'no' = '고유 번호'
    'user_id' = '사용자 계정 ID'
    'username' = '계정명'
    'user' = '사용자명'
    'role' = '권한 구분'
    'ip' = '접속 IP 주소'
    'date' = '등록 일시'
    'etc' = '비고'
    'button' = '수행 기능명'
    'type' = '유형'
    'title' = '제목'
    'message' = '메시지 내용'
    'link' = '이동 링크 URL'
    'is_read' = '읽음 여부'
    'is_cleared' = '화면 정리 여부'
    'sender_name' = '발신자 이름'
    'is_hidden' = '숨김 여부'
    'module_name' = '모듈 이름'
    'display_name' = '표시 이름'
    'manual_description' = '수동 설명'
    'related_url' = '관련 URL'
    'updated_at' = '수정 일시'
    'author' = '작성자'
    'participants' = '참여자 목록'
    'content' = '내용'
    'target_date' = '대상 날짜'
    'is_completed' = '완료 여부'
    'is_pinned' = '상단 고정 여부'
    'is_deleted' = '삭제 여부'
    'image_url' = '이미지 경로'
    'link_url' = '연결 링크 URL'
    'order_index' = '정렬 순서'
    'is_active' = '사용 여부'
    'launcher' = '런처 버전'
    'sender_account' = '발신 계정명'
    'message_text' = '전송 메시지 본문'
    'sent_at' = '전송 시각'
    'send_type' = '전송 방식'
    'ip_address' = '발신 IP 주소'
    'seller_user_id' = '판매자 계정 ID'
    'seller_username' = '판매자 계정명'
    'seller_character' = '판매 캐릭터 이름'
    'gold_copper' = '판매 골드량(코퍼 단위)'
    'price_points' = '판매 가격 포인트'
    'status' = '상태'
    'buyer_user_id' = '구매자 계정 ID'
    'buyer_character' = '구매 캐릭터 이름'
    'points_before_buyer' = '구매 전 포인트'
    'points_after_buyer' = '구매 후 포인트'
    'points_before_seller' = '판매 전 포인트'
    'points_after_seller' = '판매 후 포인트'
    'name' = '이름'
    'description' = '설명'
    'stock_qty' = '재고 수량'
    'is_visible' = '노출 여부'
    'created_by' = '등록 관리자 계정 ID'
    'updated_by' = '수정 관리자 계정 ID'
    'item_type' = '상품 유형'
    'item_entry' = '아이템 엔트리'
    'function_code' = '기능 코드'
    'icon_path' = '아이콘 경로'
    'order_id' = '주문 ID'
    'action' = '처리 동작'
    'actor_user_id' = '처리자 계정 ID'
    'before_status' = '변경 전 상태'
    'after_status' = '변경 후 상태'
    'memo' = '메모'
    'item_id' = '상품 ID'
    'item_name' = '아이템 이름'
    'qty' = '수량'
    'unit_price' = '단가'
    'total_price' = '총 결제 포인트'
    'is_refunded' = '환불 여부'
    'request_note' = '요청 메모'
    'admin_note' = '관리자 메모'
    'processed_by' = '처리 관리자 계정 ID'
    'processed_at' = '처리 일시'
    'file_type' = '파일 구분'
    'file' = '파일명'
    'md5' = 'MD5 해시 값'
    'amount' = '변동 포인트'
    'reason' = '사유'
    'admin_name' = '관리자 이름'
    'points' = '보유 포인트'
    'web_rank' = '웹 권한 등급'
    'main_char_guid' = '대표 캐릭터 GUID'
    'main_char_name' = '대표 캐릭터 이름'
    'wowpass_draw_count' = '와우패스 뽑기 횟수'
    'wowpass_selected_char_guid' = '와우패스 선택 캐릭터 GUID'
    'wowpass_selected_char_name' = '와우패스 선택 캐릭터 이름'
    'wowpass_selected_char_race' = '와우패스 선택 캐릭터 종족 ID'
    'wowpass_selected_char_class' = '와우패스 선택 캐릭터 직업 ID'
    'wowpass_selected_char_gender' = '와우패스 선택 캐릭터 성별 ID'
    'wowpass_selected_char_level' = '와우패스 선택 캐릭터 레벨'
    'carddraw_draw_count' = '카드뽑기 가능 횟수'
    'carddraw_selected_char_guid' = '카드뽑기 선택 캐릭터 GUID'
    'carddraw_selected_char_name' = '카드뽑기 선택 캐릭터 이름'
    'carddraw_selected_char_race' = '카드뽑기 선택 캐릭터 종족 ID'
    'carddraw_selected_char_class' = '카드뽑기 선택 캐릭터 직업 ID'
    'carddraw_selected_char_gender' = '카드뽑기 선택 캐릭터 성별 ID'
    'carddraw_selected_char_level' = '카드뽑기 선택 캐릭터 레벨'
    'post_id' = '게시글 ID'
    'comment_id' = '댓글 ID'
    'filename' = '저장 파일명'
    'original_filename' = '원본 파일명'
    'file_path' = '파일 상대 경로'
    'file_size' = '파일 크기(Byte)'
    'mime_type' = 'MIME 유형'
    'uploaded_by' = '업로더 계정 ID'
    'board_id' = '게시판 ID'
    'last_number' = '마지막 표시 번호'
    'min_web_read' = '읽기 최소 웹 권한'
    'min_web_write' = '쓰기 최소 웹 권한'
    'allow_attachments' = '첨부파일 허용 여부'
    'allow_rich_editor' = '리치 에디터 허용 여부'
    'allow_emoji' = '이모지 허용 여부'
    'allow_nested_comments' = '대댓글 허용 여부'
    'sort_order' = '정렬 순서'
    'rarity' = '등급 코드'
    'rarity_weight' = '등급 가중치'
    'parent_id' = '상위 ID'
    'depth' = '댓글 깊이'
    'feature_code' = '기능 코드'
    'started_at' = '시작 일시'
    'expires_at' = '만료 일시'
    'last_order_id' = '마지막 주문 ID'
    'total_months' = '누적 개월 수'
    'account_id' = '계정 ID'
    'author_name' = '작성자 이름'
    'source_url' = '비교 대상 URL'
    'required_text' = '필수 포함 문구'
    'required_image' = '필수 포함 이미지 경로'
    'resource_type' = '자원 유형'
    'resource_id' = '자원 ID'
    'resource_name' = '자원 이름'
    'rank_1' = '일반 유저 권한'
    'rank_2' = 'GM 권한'
    'rank_3' = '최고 관리자 권한'
    'viewed_at' = '조회 일시'
    'version' = '버전'
    'views' = '조회수'
    'display_number' = '게시판 표시 번호'
    'category' = '카테고리'
    'inquiry_status' = '문의 상태'
    'inquiry_memo' = '문의 내부 메모'
    'promo_verify_ok' = '홍보 자동검사 통과 여부'
    'promo_verify_message' = '홍보 자동검사 메시지'
    'promo_checked_at' = '홍보 검사 일시'
    'promo_review_status' = '홍보 심사 상태'
    'promo_review_at' = '홍보 심사 일시'
    'promo_review_by' = '홍보 심사자 계정 ID'
    'url' = 'URL 주소'
    'verify_ok' = '자동검사 통과 여부'
    'verify_message' = '자동검사 메시지'
    'checked_at' = '검사 일시'
    'review_status' = '심사 상태'
    'review_at' = '심사 일시'
    'review_by' = '심사자 계정 ID'
    'item_count' = '아이템 수량'
    'mail_subject' = '우편 제목'
    'mail_body' = '우편 내용'
    'receiver_name' = '수령 캐릭터 이름'
    'selected_char_guid' = '선택 캐릭터 GUID'
    'selected_char_name' = '선택 캐릭터 이름'
    'selected_char_race' = '선택 캐릭터 종족 ID'
    'selected_char_class' = '선택 캐릭터 직업 ID'
    'selected_char_gender' = '선택 캐릭터 성별 ID'
    'selected_char_level' = '선택 캐릭터 레벨'
    'track_level' = '트랙 단계'
    'reward_name' = '보상 이름'
    'reward_icon' = '보상 아이콘'
    'reward_rarity' = '보상 등급'
}

$tableOverrides = @{
    'notifications' = @{
        'type' = '알림 유형'
        'title' = '알림 제목'
        'message' = '알림 내용'
        'link' = '클릭 이동 링크'
    }
    'web_menu_registry' = @{
        'type' = '메뉴 구분'
        'parent_id' = '상위 메뉴 ID'
        'name' = '메뉴 이름'
    }
    'schedule' = @{
        'date' = '처리 날짜'
        'etc' = '처리 내용'
        'action' = '처리 작업'
        'target' = '대상 서버'
        'processed' = '처리 여부'
    }
    'launcher' = @{
        'no' = '고유 번호'
        'launcher' = '런처 버전'
        'date' = '런처 등록 일시'
        'etc' = '비고'
    }
    'logs' = @{
        'no' = '고유 번호'
        'user' = '수행 사용자명'
        'role' = '수행 권한'
        'ip' = '접속 IP 주소'
        'date' = '기록 일시'
        'button' = '수행 버튼명'
    }
    'web_posts' = @{
        'content' = '게시글 본문'
        'version' = '수정 버전'
    }
    'web_comments' = @{
        'parent_id' = '상위 댓글 ID'
    }
}

function Get-ColumnComment([string]$tableName, [string]$columnName) {
    if ($tableOverrides.ContainsKey($tableName) -and $tableOverrides[$tableName].ContainsKey($columnName)) {
        return $tableOverrides[$tableName][$columnName]
    }
    if ($columnComments.ContainsKey($columnName)) {
        return $columnComments[$columnName]
    }
    return '세부 정보'
}

$tables = Invoke-MySqlQuery -Query "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='update' ORDER BY TABLE_NAME;" -SkipColumnNames
foreach ($table in $tables) {
    $tableName = [string]$table
    if ([string]::IsNullOrWhiteSpace($tableName)) { continue }
    $tableComment = if ($tableComments.ContainsKey($tableName)) { $tableComments[$tableName] } else { '웹 서비스 관리 테이블' }
    $alterTableSql = "ALTER TABLE ``$tableName`` COMMENT='" + (Escape-SqlString $tableComment) + "';"
    Invoke-MySqlQuery -Query $alterTableSql | Out-Null

    $columnsRaw = Invoke-MySqlQuery -Query "SHOW FULL COLUMNS FROM ``$tableName``;" -SkipColumnNames
    foreach ($row in $columnsRaw) {
        if ([string]::IsNullOrWhiteSpace($row)) { continue }
        $parts = [string]$row -split "`t"
        if ($parts.Count -lt 9) { continue }

        $field = $parts[0]
        $type = $parts[1]
        $collation = $parts[2]
        $nullFlag = $parts[3]
        $defaultValue = $parts[5]
        $extra = $parts[6]

        $charsetClause = Get-CharsetClause $collation
        $nullClause = if ($nullFlag -eq 'NO') { ' NOT NULL' } else { ' NULL' }
        $defaultClause = Get-DefaultClause $defaultValue $type $nullFlag
        $extraClause = Get-ExtraClause $extra
        $comment = Get-ColumnComment $tableName $field

        $sql = "ALTER TABLE ``$tableName`` MODIFY COLUMN ``$field`` $type$charsetClause$nullClause$defaultClause"
        if (-not [string]::IsNullOrWhiteSpace($extraClause)) {
            $sql += " $extraClause"
        }
        $sql += " COMMENT '" + (Escape-SqlString $comment) + "';"
        Invoke-MySqlQuery -Query $sql | Out-Null
    }
}

Write-Host 'update 데이터베이스 테이블/컬럼 comment 반영이 완료되었습니다.'
