
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import './App.css'

const TEXT = {
  board: '게시판',
  eyebrow: '전설의 성채가 당신을 부른다',
  title: '카라잔',
  subtitle: '모험의 시간, 운명의 세계로',
  description:
    '어둠이 깃든 성채와 보랏빛 마력의 균열 속에서 새로운 도전이 시작됩니다. 접속 방법부터 던전 보상, 카드 뽑기, 선술집까지 필요한 정보를 한 화면에서 빠르게 확인할 수 있습니다.',
  notice: '공지사항',
  connect: '접속방법',
  rules: '서버규칙',
  carddraw: '카드뽑기',
  shop: '선술집',
  community: '커뮤니티',
  contents: '컨텐츠',
  auction: '경매장',
  welcome: '님 환영합니다.',
  loadingBoards: '게시판을 불러오는 중입니다.',
  loadingPosts: '게시글을 불러오는 중입니다.',
  noPosts: '게시글이 없습니다.',
  search: '검색',
  write: '글쓰기',
  home: '홈으로',
  back: '목록으로',
  save: '저장',
  titleRequired: '제목은 필수입니다.',
  contentRequired: '내용은 필수입니다.',
  writeDenied: '이 게시판에는 글쓰기 권한이 없습니다.',
  titlePlaceholder: '제목을 입력해 주세요.',
  bodyPlaceholder: '내용을 입력해 주세요.',
  commentPlaceholder: '댓글을 입력해 주세요.',
  commentsEmpty: '등록된 댓글이 없습니다.',
  commentsNeedLogin: '로그인해야 댓글을 작성할 수 있습니다.',
  previous: '이전',
  next: '다음',
  number: '번호',
  titleCol: '제목',
  author: '작성자',
  time: '시간',
}

const DEFAULT_HOME = {
  hero: {
    background: '/img/main_bg.png?v=20260416_1',
    eyebrow: TEXT.eyebrow,
    title: TEXT.title,
    subtitle: TEXT.subtitle,
    description: TEXT.description,
  },
  nav: [
    { label: TEXT.notice, url: '#notice-section' },
    {
      label: TEXT.connect,
      url: '#connect-section',
      children: [
        { label: TEXT.connect, url: '#connect-section' },
        { label: TEXT.rules, url: '#rules-section' },
      ],
    },
    { label: TEXT.carddraw, url: '/carddraw/' },
    { label: TEXT.shop, url: '/shop/' },
    { label: TEXT.auction, url: '#auction-section' },
  ],
}

const CONNECT_CLIENT_DOWNLOAD_URL = 'https://drive.google.com/file/d/14tO_E-R0EIbzz_aiJ0tsBO5T4hvmocGe/view?usp=sharing'
const CONNECT_LAUNCHER_DOWNLOAD_URL = 'https://drive.google.com/file/d/119sSxI8NsWLlhp4aKkNNMQL8sabMc52A/view?usp=sharing'
const SERVER_RULES_IMAGE_URL = '/img/규칙.png?v=20260603_1'
const NOTIFICATION_CATEGORIES = [
  { value: '', label: '전체' },
  { value: 'comment', label: '댓글' },
  { value: 'point', label: '포인트' },
  { value: 'admin_msg', label: '운영 알림' },
]
const AUCTION_CLASS_MAP = {
  0: '소모품',
  1: '가방',
  2: '무기',
  3: '보석',
  4: '방어구',
  5: '재료',
  6: '투사체',
  7: '거래상품',
  9: '요리',
  11: '화살통',
  12: '퀘스트',
  13: '열쇠',
  15: '기타',
}
const AUCTION_SUBCLASS_MAP = {
  2: {
    0: '한손 도끼', 1: '양손 도끼', 2: '활', 3: '총', 4: '한손 둔기', 5: '양손 둔기',
    6: '장창', 7: '한손 검', 8: '양손 검', 10: '지팡이', 13: '주먹 무기', 14: '기타',
    15: '단검', 16: '투척', 17: '창', 18: '석궁', 19: '마법봉', 20: '낚싯대',
  },
  4: {
    0: '기타', 1: '천', 2: '가죽', 3: '사슬', 4: '판금', 6: '방패',
    7: '성서', 8: '우상', 9: '토템', 10: '인장',
  },
}
const AUCTION_QUALITY_MAP = {
  0: { text: '하급', color: '#9ca3af' },
  1: { text: '일반', color: '#ffffff' },
  2: { text: '고급', color: '#22c55e' },
  3: { text: '희귀', color: '#60a5fa' },
  4: { text: '영웅', color: '#c084fc' },
  5: { text: '전설', color: '#f59e0b' },
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `요청 실패 (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : response.text()
}

function sanitizeHtml(content) {
  const template = document.createElement('template')
  template.innerHTML = String(content || '')
  template.content.querySelectorAll('script, iframe, object, embed').forEach((node) => node.remove())
  template.content.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes || []).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = String(attr.value || '').trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        node.removeAttribute(attr.name)
      }
    })
  })
  return template.innerHTML
}

function extractFirstImageUrl(content) {
  const template = document.createElement('template')
  template.innerHTML = String(content || '')
  const image = template.content.querySelector('img')
  return image?.getAttribute('src') || ''
}

function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : ''
}

function formatShortDate(value) {
  const normalized = formatDate(value)
  if (!normalized) return '-'
  return normalized.slice(5, 10).replace('-', '.')
}

function formatNotificationTime(value) {
  if (!value) return '-'
  const createdAt = new Date(value)
  if (Number.isNaN(createdAt.getTime())) return formatDate(value)
  const diffSeconds = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 1000))
  if (diffSeconds < 60) return '방금 전'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}일 전`
  return formatDate(value)
}

function notificationTypeMeta(type) {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'comment') return { icon: '✉', className: 'comment' }
  if (normalized === 'point') return { icon: 'P', className: 'point' }
  if (normalized === 'admin_msg') return { icon: 'GM', className: 'admin' }
  return { icon: '•', className: 'default' }
}

function notificationTypeLabel(type) {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'comment') return '댓글'
  if (normalized === 'point') return '포인트'
  if (normalized === 'admin_msg') return '운영 알림'
  return '알림'
}

function formatAuctionCoins(value) {
  const amount = Math.max(0, Number(value || 0))
  const gold = Math.floor(amount / 10000)
  const silver = Math.floor((amount % 10000) / 100)
  const copper = amount % 100
  return { gold, silver, copper }
}

function formatAuctionPrice(value) {
  const { gold, silver, copper } = formatAuctionCoins(value)
  return `${gold.toLocaleString()}골드 ${silver}실버 ${copper}코퍼`
}

function formatWonInput(value) {
  const digits = String(value || '').replace(/[^\d]/g, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}

function auctionClassText(itemClass, itemSubclass) {
  const className = AUCTION_CLASS_MAP[Number(itemClass)] || `분류 ${Number(itemClass || 0)}`
  const subMap = AUCTION_SUBCLASS_MAP[Number(itemClass)] || {}
  const subclassName = subMap[Number(itemSubclass)]
  return subclassName ? `${className} / ${subclassName}` : className
}

function auctionQualityMeta(quality) {
  return AUCTION_QUALITY_MAP[Number(quality)] || AUCTION_QUALITY_MAP[1]
}

function formatAuctionRemain(endUnix) {
  const diff = Number(endUnix || 0) - Math.floor(Date.now() / 1000)
  if (diff <= 0) return '종료'
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  if (days > 0) return `${days}일 ${hours}시간`
  return `${hours}시간 ${minutes}분`
}

function isAdmin(user) {
  if (!user) return false
  const permissions = user.permissions && typeof user.permissions === 'object' ? user.permissions : {}
  return Number(user.webRank ?? user.web_rank ?? 0) >= 2 || Number(user.gmLevel ?? 0) > 0 || permissions.admin_all === true
}

function canRead(board, user) {
  if (!board) return false
  if (isAdmin(user)) return true
  if (board.id === 'bugreport' || board.id === 'inquiry') return !!user
  const permissions = user?.permissions && typeof user.permissions === 'object' ? user.permissions : {}
  return permissions[`board_read_${board.id}`] === true || Number(user?.webRank ?? user?.web_rank ?? 0) >= Number(board.min_web_read || 0)
}

function canWrite(board, user) {
  if (!board || !user) return false
  if (isAdmin(user)) return true
  const permissions = user.permissions && typeof user.permissions === 'object' ? user.permissions : {}
  return permissions[`board_write_${board.id}`] === true || Number(user.webRank ?? user.web_rank ?? 0) >= Number(board.min_web_write || 999)
}

function hasRepresentativeCharacter(user) {
  return Boolean(user?.mainCharacter?.guid && user?.mainCharacter?.name)
}

function canEditOwner(target, user) {
  return !!user && (isAdmin(user) || Number(target?.account_id || 0) === Number(user?.accountID || user?.id || 0))
}

function normalizeHomePayload(payload) {
  if (!payload || typeof payload !== 'object') return DEFAULT_HOME
  const content = payload.content && typeof payload.content === 'object' ? payload.content : payload
  const hero = content.hero && typeof content.hero === 'object' ? content.hero : {}
  const normalizedNav = Array.isArray(content.nav)
    ? content.nav.map((item) => {
      const label = String(item?.label || '').trim()
      const url = String(item?.url || '').trim()
      if (label === '가이드') {
        return {
          ...item,
          label: TEXT.contents,
          url: url === '#guide-section' ? '#contents-section' : (url || '#contents-section'),
        }
      }
      if (label === TEXT.connect) {
        const children = Array.isArray(item?.children) && item.children.length
          ? item.children.map((child) => ({
            ...child,
            label: String(child?.label || '').trim() || TEXT.connect,
            url: String(child?.url || '').trim() || '#connect-section',
          }))
          : [
            { label: TEXT.connect, url: '#connect-section' },
            { label: TEXT.rules, url: '#rules-section' },
          ]
        return {
          ...item,
          label: TEXT.connect,
          url: url || '#connect-section',
          children,
        }
      }
      return item
    })
    : DEFAULT_HOME.nav
  return {
    ...DEFAULT_HOME,
    ...content,
    hero: {
      ...DEFAULT_HOME.hero,
      ...hero,
    },
    nav: normalizedNav,
  }
}

function QuillEditor({ value, onChange, onAlert }) {
  const hostRef = useRef(null)
  const quillRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current || quillRef.current) return undefined

    const quill = new Quill(hostRef.current, {
      theme: 'snow',
      placeholder: TEXT.bodyPlaceholder,
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image'],
          ['clean'],
        ],
      },
    })

    quill.getModule('toolbar').addHandler('image', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        try {
          const result = await apiFetch('/api/board/upload', {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          })
          const url = result?.url || result?.path
          if (!url) return
          const range = quill.getSelection(true)
          quill.insertEmbed(range?.index ?? quill.getLength(), 'image', url)
        } catch (error) {
          if (onAlert) onAlert(error?.message || '이미지 업로드에 실패했습니다.')
        }
      }
      input.click()
    })

    quill.on('text-change', () => onChange(quill.root.innerHTML))
    quill.root.innerHTML = value || ''
    quillRef.current = quill

    return () => {
      quillRef.current = null
    }
  }, [onAlert, onChange])

  useEffect(() => {
    if (quillRef.current && quillRef.current.root.innerHTML !== (value || '')) {
      quillRef.current.root.innerHTML = value || ''
    }
  }, [value])

  return (
    <div className="public-editor-shell">
      <div id="public-write-editor" ref={hostRef} />
    </div>
  )
}
function InquiryFields({ category, onCategoryChange, sponsorAgree, onSponsorAgreeChange, sponsorName, onSponsorNameChange, sponsorAmount, onSponsorAmountChange, mode = 'inquiry' }) {
  const isBugReport = mode === 'bugreport'
  const isSponsor = String(category || '').trim() === '후원'
  const sponsorPoint = Math.floor((Number(String(sponsorAmount || '').replace(/[^\d]/g, '')) || 0) / 1000)
  const options = isBugReport
    ? ['게임 오류', '웹 오류', '계정/접속', '기타']
    : ['건의', '질문', '후원', '기타']

  return (
    <div className="board-special-fields">
      <div className="board-field-row">
        <label className="board-field-label">{isBugReport ? '오류 유형' : '문의 카테고리'}</label>
        <select className="public-board-text-input" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">{isBugReport ? '오류 유형을 선택해 주세요.' : '카테고리를 선택해 주세요.'}</option>
          {options.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {!isBugReport && isSponsor && (
        <div className="board-sponsor-box">
          <div className="board-sponsor-guide">
            <div className="board-sponsor-copy">
              <span className="board-sponsor-kicker">후원 안내</span>
              <strong>입금 후 문의글을 남겨주시면 확인 후 포인트가 지급됩니다.</strong>
              <p>카카오페이 QR 또는 등록된 입금 수단으로 후원하신 뒤, 후원자명과 후원 금액을 정확히 입력해 주세요. 입력 정보가 실제 입금 내역과 다르면 처리가 지연될 수 있습니다.</p>
              <div className="board-sponsor-notice">
                쾌적한 서버 환경을 위해 전달해주시는 후원금은 자발적인 지원으로 간주됩니다. 이는 아이템 판매 수익이 아니므로 환불 도움을 드리기 어렵습니다. 서버의 지속적인 운영을 위해 신중하게 후원을 결정해 주시면 감사하겠습니다.
              </div>
              <ul>
                <li>후원 포인트는 1,000원당 1pt 기준으로 계산됩니다.</li>
                <li>관리자 확인 후 문의 진행 내용에 처리 결과가 남습니다.</li>
                <li>후원 관련 문의는 본인 글에서만 확인할 수 있습니다.</li>
              </ul>
            </div>
            <div className="board-sponsor-qr">
              <img src="/img/kakaopay.jpg" alt="카카오페이 후원 QR 코드" />
              <span>카카오페이 QR</span>
            </div>
          </div>
          <button
            className={`board-sponsor-agree ${sponsorAgree ? 'active' : ''}`}
            type="button"
            onClick={() => onSponsorAgreeChange(!sponsorAgree)}
          >
            {sponsorAgree ? '후원 안내 동의 완료' : '후원 안내 확인 및 동의하기'}
          </button>
          <div className="board-field-row">
            <label className="board-field-label">후원자명</label>
            <input className="public-board-text-input" value={sponsorName} onChange={(e) => onSponsorNameChange(e.target.value)} placeholder="후원자명을 입력해 주세요." disabled={!sponsorAgree} />
          </div>
          <div className="board-field-row">
            <label className="board-field-label">후원 금액</label>
            <div className="board-won-input-wrap">
              <input className="public-board-text-input" value={formatWonInput(sponsorAmount)} onChange={(e) => onSponsorAmountChange(e.target.value.replace(/[^\d]/g, ''))} placeholder="예: 10,000" disabled={!sponsorAgree} inputMode="numeric" />
              <span>원</span>
            </div>
          </div>
          <div className="board-sponsor-preview">예상 지급 포인트: {sponsorPoint.toLocaleString()}pt (1,000원당 1pt)</div>
        </div>
      )}
    </div>
  )
}

function PromotionFields({ urls, onChange, onAdd, onRemove }) {
  return (
    <div className="board-special-fields">
      <div className="board-field-row">
        <label className="board-field-label">홍보 URL</label>
        <div className="board-promotion-list">
          {urls.map((url, index) => (
            <div key={`promotion-url-${index}`} className="board-promotion-row">
              <span className="board-promotion-index">{index + 1}.</span>
              <input className="public-board-text-input" value={url} onChange={(e) => onChange(index, e.target.value)} placeholder="https://example.com/promotion" />
              <button className="btn btn-small" type="button" onClick={() => onRemove(index)}>삭제</button>
            </div>
          ))}
        </div>
        <div className="public-post-write-actions public-post-write-actions-inline">
          <button className="btn btn-small" type="button" onClick={onAdd}>URL 추가</button>
        </div>
      </div>
    </div>
  )
}

function renderAuthor(authorName, isStaffAuthor, hasEnhancedStone) {
  return (
    <span className="public-author-inline">
      {hasEnhancedStone ? <span className="public-author-badge gem" title="빛나는 영웅석 구독">◆</span> : null}
      {isStaffAuthor ? <img className="public-author-mark" src="/img/Battlenet_2021_icon.svg" alt="운영진" title="운영진" /> : null}
      <span>{authorName || '-'}</span>
    </span>
  )
}

function getSupportStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'in_progress':
      return '진행중'
    case 'done':
      return '완료'
    case 'received':
    default:
      return '접수'
  }
}

function renderSupportStatus(status) {
  const normalized = String(status || 'received').toLowerCase()
  return <span className={`support-status-badge support-status-${normalized}`}>{getSupportStatusLabel(normalized)}</span>
}

function getRaceIcon(race, gender) {
  const raceKeyById = {
    1: 'human',
    2: 'orc',
    3: 'dwarf',
    4: 'nightelf',
    5: 'undead',
    6: 'tauren',
    7: 'gnome',
    8: 'troll',
    10: 'bloodelf',
    11: 'draenei',
  }
  const raceKey = raceKeyById[Number(race)] || 'human'
  const genderKey = Number(gender) === 1 ? 'female' : 'male'
  return `/img/icons/race_${raceKey}_${genderKey}.gif`
}

function getRaceName(race) {
  const races = {
    1: '인간',
    2: '오크',
    3: '드워프',
    4: '나이트엘프',
    5: '언데드',
    6: '타우렌',
    7: '노움',
    8: '트롤',
    10: '블러드엘프',
    11: '드레나이',
  }
  return races[Number(race)] || '알 수 없음'
}

function getClassName(cls) {
  const classes = {
    1: '전사',
    2: '성기사',
    3: '사냥꾼',
    4: '도적',
    5: '사제',
    6: '죽음의 기사',
    7: '주술사',
    8: '마법사',
    9: '흑마법사',
    11: '드루이드',
  }
  return classes[Number(cls)] || '알 수 없음'
}

function getZoneName(mapId) {
  const zones = {
    0: '동부 왕국',
    1: '칼림도어',
    530: '아웃랜드',
    571: '노스렌드',
    1519: '스톰윈드',
    1637: '오그리마',
    1537: '아이언포지',
    1638: '썬더 블러프',
    1657: '다르나서스',
    1497: '언더시티',
    3487: '실버문',
    3557: '엑소다르',
    4395: '달라란',
  }
  return zones[Number(mapId)] || `Map ${mapId || 0}`
}

function getBoardPreviewTag(boardName = '') {
  if (boardName.includes('공지')) return { label: '공지', className: 'notice' }
  if (boardName.includes('업데이트')) return { label: '업데이트', className: 'update' }
  if (boardName.includes('문의')) return { label: '문의', className: 'event' }
  if (boardName.includes('홍보')) return { label: '홍보', className: 'guide' }
  return { label: boardName || '게시판', className: 'notice' }
}

function scrollToPageTop() {
  window.scrollTo(0, 0)
}

function emitAppAlert(message, title = '안내') {
  window.dispatchEvent(new CustomEvent('karazhan:alert', { detail: { message, title } }))
}

function getLoadingMessageByUrl(url) {
  const text = String(url || '')
  if (text.includes('/api/auction/')) return '경매장 데이터를 불러오는 중입니다.'
  if (text.includes('/api/board/')) return '게시판 데이터를 불러오는 중입니다.'
  if (text.includes('/api/user/characters')) return '캐릭터 정보를 불러오는 중입니다.'
  if (text.includes('/api/user/points')) return '포인트 내역을 불러오는 중입니다.'
  if (text.includes('/api/public/contents')) return '컨텐츠 정보를 불러오는 중입니다.'
  return '데이터를 불러오는 중입니다.'
}

function GlobalLoadingOverlay({ visible, message }) {
  return (
    <div className={`global-loading-overlay${visible ? ' active' : ''}`} aria-hidden={visible ? 'false' : 'true'}>
      <div className="global-loading-card" role="status" aria-live="polite" aria-busy={visible ? 'true' : 'false'}>
        <div className="global-loading-spinner" aria-hidden="true">
          <svg viewBox="0 0 104 104">
            <circle className="global-loading-track" cx="52" cy="52" r="34" />
            <circle className="global-loading-arc" cx="52" cy="52" r="34" />
          </svg>
        </div>
        <strong>잠시만 기다려주세요</strong>
        <p>{message || '데이터를 불러오는 중입니다.'}</p>
      </div>
    </div>
  )
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const userMenuRef = useRef(null)
  const notificationMenuRef = useRef(null)
  const dialogResolveRef = useRef(null)
  const globalLoadingCountRef = useRef(0)
  const globalLoadingTimerRef = useRef(null)
  const globalFetchPatchedRef = useRef(false)
  const globalOriginalFetchRef = useRef(null)

  const [home, setHome] = useState(DEFAULT_HOME)
  const [user, setUser] = useState(null)
  const [boards, setBoards] = useState([])
  const [contentItems, setContentItems] = useState([])
  const [posts, setPosts] = useState([])
  const [detail, setDetail] = useState(null)
  const [screen, setScreen] = useState('home')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState(0)
  const [commentInput, setCommentInput] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [boardId, setBoardId] = useState('')
  const [inquiryCategory, setInquiryCategory] = useState('')
  const [promotionUrls, setPromotionUrls] = useState([''])
  const [sponsorAgree, setSponsorAgree] = useState(false)
  const [sponsorName, setSponsorName] = useState('')
  const [sponsorAmount, setSponsorAmount] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [dropdownNotifications, setDropdownNotifications] = useState([])
  const [notifications, setNotifications] = useState([])
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationPage, setNotificationPage] = useState(1)
  const [notificationTotalPages, setNotificationTotalPages] = useState(1)
  const [notificationSearchInput, setNotificationSearchInput] = useState('')
  const [notificationSearch, setNotificationSearch] = useState('')
  const [notificationCategory, setNotificationCategory] = useState('')
  const [notificationCenterLoading, setNotificationCenterLoading] = useState(false)
  const [commentHighlightRequest, setCommentHighlightRequest] = useState({ tick: 0, fallbackLatest: false })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userLoaded, setUserLoaded] = useState(false)
  const [dialogState, setDialogState] = useState({ open: false, mode: 'alert', title: '안내', message: '' })
  const [myPageCharacters, setMyPageCharacters] = useState([])
  const [myPageCharactersLoading, setMyPageCharactersLoading] = useState(false)
  const [myPagePointLogs, setMyPagePointLogs] = useState([])
  const [myPagePointPage, setMyPagePointPage] = useState(1)
  const [myPagePointTotalPages, setMyPagePointTotalPages] = useState(1)
  const [myPagePointLoading, setMyPagePointLoading] = useState(false)
  const [noticePreviewPosts, setNoticePreviewPosts] = useState([])
  const [communityPreviewPosts, setCommunityPreviewPosts] = useState([])
  const [mediaPreviewPosts, setMediaPreviewPosts] = useState([])
  const [worldServerOnline, setWorldServerOnline] = useState(null)
  const [worldStatusUpdatedAt, setWorldStatusUpdatedAt] = useState('')
  const [auctionTab, setAuctionTab] = useState('list')
  const [auctionRows, setAuctionRows] = useState([])
  const [auctionPage, setAuctionPage] = useState(1)
  const [auctionTotalPages, setAuctionTotalPages] = useState(1)
  const [auctionLoading, setAuctionLoading] = useState(false)
  const [auctionSearchInput, setAuctionSearchInput] = useState('')
  const [auctionSearch, setAuctionSearch] = useState('')
  const [auctionStatus, setAuctionStatus] = useState('')
  const [auctionMyRows, setAuctionMyRows] = useState([])
  const [auctionMyPage, setAuctionMyPage] = useState(1)
  const [auctionMyTotalPages, setAuctionMyTotalPages] = useState(1)
  const [auctionMyLoading, setAuctionMyLoading] = useState(false)
  const [auctionCharacters, setAuctionCharacters] = useState([])
  const [auctionCharactersLoading, setAuctionCharactersLoading] = useState(false)
  const [auctionCreateCharGuid, setAuctionCreateCharGuid] = useState(0)
  const [auctionCreateItems, setAuctionCreateItems] = useState([])
  const [auctionCreateItemsLoading, setAuctionCreateItemsLoading] = useState(false)
  const [auctionCreateSearch, setAuctionCreateSearch] = useState('')
  const [auctionSelectedItemGuid, setAuctionSelectedItemGuid] = useState(0)
  const [auctionDurationHours, setAuctionDurationHours] = useState(24)
  const [auctionStartBidGold, setAuctionStartBidGold] = useState('')
  const [auctionStartBidSilver, setAuctionStartBidSilver] = useState('')
  const [auctionStartBidCopper, setAuctionStartBidCopper] = useState('')
  const [auctionBuyoutGold, setAuctionBuyoutGold] = useState('')
  const [auctionBuyoutSilver, setAuctionBuyoutSilver] = useState('')
  const [auctionBuyoutCopper, setAuctionBuyoutCopper] = useState('')
  const [auctionAction, setAuctionAction] = useState(null)
  const [auctionActionCharGuid, setAuctionActionCharGuid] = useState(0)
  const [auctionActionBidGold, setAuctionActionBidGold] = useState('')
  const [auctionActionBidSilver, setAuctionActionBidSilver] = useState('')
  const [auctionActionBidCopper, setAuctionActionBidCopper] = useState('')
  const [auctionIconMap, setAuctionIconMap] = useState({})
  const [auctionBusy, setAuctionBusy] = useState(false)
  const [auctionBusyMessage, setAuctionBusyMessage] = useState('')
  const [globalLoadingVisible, setGlobalLoadingVisible] = useState(false)
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState('데이터를 불러오는 중입니다.')

  const currentBoard = useMemo(() => boards.find((board) => board.id === boardId) || null, [boards, boardId])
  const headerNavItems = useMemo(
    () => home.nav.filter((item) => ![TEXT.notice, TEXT.community, TEXT.contents].includes(item.label)),
    [home.nav],
  )
  const visibleBoards = useMemo(() => boards.filter((board) => canRead(board, user)), [boards, user])
  const noticeBoard = useMemo(() => visibleBoards.find((board) => board.name.includes('공지')) || null, [visibleBoards])
  const freeBoard = useMemo(() => visibleBoards.find((board) => board.name.includes('자유')) || null, [visibleBoards])
  const selectedContentItem = useMemo(
    () => contentItems.find((item) => item.id === selectedContent) || null,
    [contentItems, selectedContent],
  )
  const isInquiryBoard = currentBoard?.id === 'inquiry'
  const isBugReportBoard = currentBoard?.id === 'bugreport'
  const isSupportBoard = isInquiryBoard || isBugReportBoard
  const isPromotionBoard = currentBoard?.id === 'promotion'
  const myPageMainCharacter = user?.mainCharacter && Number(user.mainCharacter.guid || 0) > 0 ? user.mainCharacter : null
  const auctionSelectedCharacter = auctionCharacters.find((character) => Number(character.guid) === Number(auctionCreateCharGuid)) || null
  const filteredAuctionCreateItems = useMemo(() => {
    const keyword = String(auctionCreateSearch || '').trim().toLowerCase()
    if (!keyword) return auctionCreateItems
    return auctionCreateItems.filter((item) => String(item.item_name || '').toLowerCase().includes(keyword) || String(item.item_entry || '').includes(keyword))
  }, [auctionCreateItems, auctionCreateSearch])

  const closeDialog = useCallback((result = false) => {
    const resolve = dialogResolveRef.current
    dialogResolveRef.current = null
    setDialogState((prev) => ({ ...prev, open: false }))
    if (resolve) resolve(result)
  }, [])

  const showAlert = useCallback((message, title = '안내') => (
    new Promise((resolve) => {
      dialogResolveRef.current = resolve
      setDialogState({ open: true, mode: 'alert', title, message: String(message || '') })
    })
  ), [])

  const showConfirm = useCallback((message, title = '확인') => (
    new Promise((resolve) => {
      dialogResolveRef.current = resolve
      setDialogState({ open: true, mode: 'confirm', title, message: String(message || '') })
    })
  ), [])

  const runAuctionTask = useCallback(async (message, task) => {
    if (auctionBusy) return false
    setAuctionBusy(true)
    setAuctionBusyMessage(message || '인게임 경매 데이터를 확인하는 중입니다...')
    try {
      await task()
      return true
    } catch (error) {
      if (error?.message) {
        await showAlert(error.message)
      }
      return false
    } finally {
      setAuctionBusy(false)
      setAuctionBusyMessage('')
    }
  }, [auctionBusy, showAlert])

  const resetWriteState = useCallback(() => {
    setTitle('')
    setContent('')
    setEditingId(0)
    setInquiryCategory('')
    setPromotionUrls([''])
    setSponsorAgree(false)
    setSponsorName('')
    setSponsorAmount('')
  }, [])

  useEffect(() => {
    if (globalFetchPatchedRef.current || typeof window === 'undefined' || typeof window.fetch !== 'function') return undefined

    const shouldTrackRequest = (input, init) => {
      const url = typeof input === 'string' ? input : String(input?.url || '')
      if (!url.includes('/api/')) return false
      if (url.includes('/api/external/item_icon')) return false
      if (url.includes('/api/auction/bid') || url.includes('/api/auction/buyout') || url.includes('/api/auction/create') || url.includes('/api/auction/cancel')) return false

      const headers = init?.headers
      if (headers && typeof headers.get === 'function' && headers.get('X-Background-Request') === '1') return false
      if (headers && typeof headers === 'object' && (headers['X-Background-Request'] === '1' || headers['x-background-request'] === '1')) return false

      return true
    }

    const beginLoading = (message) => {
      globalLoadingCountRef.current += 1
      setGlobalLoadingMessage(message || '데이터를 불러오는 중입니다.')
      if (globalLoadingCountRef.current === 1) {
        globalLoadingTimerRef.current = window.setTimeout(() => {
          setGlobalLoadingVisible(true)
          globalLoadingTimerRef.current = null
        }, 160)
      }
    }

    const endLoading = () => {
      globalLoadingCountRef.current = Math.max(0, globalLoadingCountRef.current - 1)
      if (globalLoadingCountRef.current === 0) {
        if (globalLoadingTimerRef.current) {
          window.clearTimeout(globalLoadingTimerRef.current)
          globalLoadingTimerRef.current = null
        }
        setGlobalLoadingVisible(false)
      }
    }

    globalOriginalFetchRef.current = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const shouldTrack = shouldTrackRequest(input, init)
      if (shouldTrack) {
        const url = typeof input === 'string' ? input : String(input?.url || '')
        beginLoading(getLoadingMessageByUrl(url))
      }

      return globalOriginalFetchRef.current(input, init)
        .finally(() => {
          if (shouldTrack) endLoading()
        })
    }

    globalFetchPatchedRef.current = true

    return () => {
      if (globalOriginalFetchRef.current) {
        window.fetch = globalOriginalFetchRef.current
      }
      if (globalLoadingTimerRef.current) {
        window.clearTimeout(globalLoadingTimerRef.current)
        globalLoadingTimerRef.current = null
      }
      globalFetchPatchedRef.current = false
      globalLoadingCountRef.current = 0
    }
  }, [])

  const loadHome = useCallback(async () => {
    try {
      const response = await apiFetch('/api/public/home')
      setHome(normalizeHomePayload(response))
    } catch {
      setHome(DEFAULT_HOME)
    }
  }, [])

  const loadContents = useCallback(async () => {
    try {
      const response = await apiFetch('/api/public/contents')
      setContentItems(asArray(response))
    } catch {
      setContentItems([])
    }
  }, [])

  const loadUser = useCallback(async () => {
    try {
      const response = await apiFetch('/api/user/status')
      setUser(response && typeof response === 'object' ? response : null)
    } catch {
      setUser(null)
    } finally {
      setUserLoaded(true)
    }
  }, [])

  const loadBoards = useCallback(async () => {
    const response = await apiFetch('/api/board/list')
    setBoards(asArray(response))
  }, [])

  const loadNotifications = useCallback(async (quiet = false) => {
    if (!quiet) setNotificationLoading(true)
    try {
      const response = await apiFetch('/api/notifications/list?limit=6', {
        headers: quiet ? { 'X-Background-Request': '1' } : undefined,
      })
      setDropdownNotifications(asArray(response?.notifications))
      setNotificationUnreadCount(Number(response?.unread_count || 0))
    } finally {
      if (!quiet) setNotificationLoading(false)
    }
  }, [])

  const loadNotificationCenter = useCallback(async (targetPage = 1, targetSearch = notificationSearch, targetCategory = notificationCategory) => {
    setNotificationCenterLoading(true)
    try {
      const query = new URLSearchParams({ limit: '20', page: String(targetPage) })
      if (targetSearch) query.set('search', targetSearch)
      if (targetCategory) query.set('type', targetCategory)
      const response = await apiFetch(`/api/notifications/list?${query.toString()}`)
      setNotifications(asArray(response?.notifications))
      setNotificationUnreadCount(Number(response?.unread_count || 0))
      setNotificationPage(Number(response?.page || targetPage || 1))
      setNotificationTotalPages(Number(response?.total_pages || 1))
    } finally {
      setNotificationCenterLoading(false)
    }
  }, [notificationCategory, notificationSearch])

  const loadMyPageCharacters = useCallback(async () => {
    setMyPageCharactersLoading(true)
    try {
      const response = await apiFetch('/api/user/characters')
      setMyPageCharacters(asArray(response))
    } finally {
      setMyPageCharactersLoading(false)
    }
  }, [])

  const loadMyPagePointHistory = useCallback(async (targetPage = 1) => {
    setMyPagePointLoading(true)
    try {
      const response = await apiFetch(`/api/user/points/history?page=${targetPage}`)
      setMyPagePointLogs(asArray(response?.logs))
      setMyPagePointPage(Number(response?.page || targetPage || 1))
      setMyPagePointTotalPages(Number(response?.totalPages || 1))
    } finally {
      setMyPagePointLoading(false)
    }
  }, [])

  const loadHomeBoardPreviews = useCallback(async (targetBoards) => {
    const nextBoards = asArray(targetBoards)
    if (!nextBoards.length) {
      setNoticePreviewPosts([])
      setCommunityPreviewPosts([])
      setMediaPreviewPosts([])
      return
    }

    const notice = nextBoards.find((board) => board.name.includes('공지')) || null
    const free = nextBoards.find((board) => board.name.includes('자유')) || null
    const updateBoard = nextBoards.find((board) => board.name.includes('업데이트')) || null

    if (notice) {
      try {
        const response = await apiFetch(`/api/board/posts?board_id=${encodeURIComponent(notice.id)}&page=1&limit=4`)
        setNoticePreviewPosts(asArray(response?.posts).map((post) => ({ ...post, board_name: notice.name, board_id: notice.id })))
      } catch {
        setNoticePreviewPosts([])
      }
    } else {
      setNoticePreviewPosts([])
    }

    if (free) {
      try {
        const response = await apiFetch(`/api/board/posts?board_id=${encodeURIComponent(free.id)}&page=1&limit=12`)
        const freePosts = asArray(response?.posts).map((post) => ({ ...post, board_name: free.name, board_id: free.id }))
        setCommunityPreviewPosts(freePosts.slice(0, 4))
      } catch {
        setCommunityPreviewPosts([])
      }
    } else {
      setCommunityPreviewPosts([])
    }

    if (updateBoard) {
      try {
        const response = await apiFetch(`/api/board/posts?board_id=${encodeURIComponent(updateBoard.id)}&page=1&limit=5`)
        const updatePosts = asArray(response?.posts)
          .map((post) => ({
            ...post,
            board_name: updateBoard.name,
            board_id: updateBoard.id,
            preview_image: extractFirstImageUrl(post.content) || '/img/HS_Key_Art_SG2.avif',
          }))
          .slice(0, 5)
        setMediaPreviewPosts(updatePosts)
      } catch {
        setMediaPreviewPosts([])
      }
    } else {
      setMediaPreviewPosts([])
    }
  }, [])

  const loadWorldServerStatus = useCallback(async () => {
    try {
      const response = await apiFetch('/api/server/world-status')
      setWorldServerOnline(response?.world_running === true)
      setWorldStatusUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setWorldServerOnline(false)
      setWorldStatusUpdatedAt('확인 실패')
    }
  }, [])

  const loadAuctionList = useCallback(async (targetPage = 1, targetSearch = auctionSearch, targetStatus = auctionStatus) => {
    setAuctionLoading(true)
    try {
      const query = new URLSearchParams({ page: String(targetPage), limit: '20' })
      if (targetSearch) query.set('search', targetSearch)
      if (targetStatus) query.set('status', targetStatus)
      const response = await apiFetch(`/api/auction/list?${query.toString()}`)
      setAuctionRows(asArray(response?.rows))
      setAuctionPage(Number(response?.page || targetPage || 1))
      setAuctionTotalPages(Number(response?.totalPages || 1))
    } finally {
      setAuctionLoading(false)
    }
  }, [auctionSearch, auctionStatus])

  const loadAuctionMyList = useCallback(async (targetPage = 1) => {
    setAuctionMyLoading(true)
    try {
      const response = await apiFetch(`/api/auction/my-list?page=${targetPage}`)
      setAuctionMyRows(asArray(response?.rows))
      setAuctionMyPage(Number(response?.page || targetPage || 1))
      setAuctionMyTotalPages(Number(response?.totalPages || 1))
    } finally {
      setAuctionMyLoading(false)
    }
  }, [])

  const loadAuctionCharacters = useCallback(async () => {
    setAuctionCharactersLoading(true)
    try {
      const response = await apiFetch('/api/auction/my-characters')
      const characters = asArray(response?.characters)
      setAuctionCharacters(characters)
      if (!auctionCreateCharGuid && characters.length) {
        setAuctionCreateCharGuid(Number(characters[0].guid || 0))
      }
      return characters
    } finally {
      setAuctionCharactersLoading(false)
    }
  }, [auctionCreateCharGuid])

  const loadAuctionCreateItems = useCallback(async (charGuid) => {
    const targetGuid = Number(charGuid || 0)
    if (!targetGuid) {
      setAuctionCreateItems([])
      return
    }
    setAuctionCreateItemsLoading(true)
    try {
      const response = await apiFetch(`/api/auction/my-items?char_guid=${targetGuid}`)
      setAuctionCreateItems(asArray(response?.items))
    } finally {
      setAuctionCreateItemsLoading(false)
    }
  }, [])

  const loadPosts = useCallback(async (targetBoardId, targetPage, targetSearch) => {
    if (!targetBoardId) return
    setLoadingPosts(true)
    try {
      const query = new URLSearchParams({ board_id: targetBoardId, page: String(targetPage), limit: '20' })
      if (targetSearch) query.set('search', targetSearch)
      const response = await apiFetch(`/api/board/posts?${query.toString()}`)
      setPosts(asArray(response?.posts))
      setTotalPages(Number(response?.totalPages || 1))
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  const openPost = useCallback(async (postId) => {
    const response = await apiFetch(`/api/board/post?id=${postId}`)
    setDetail(response)
    setCommentInput('')
    setReplyTarget(null)
    setScreen('detail')
  }, [])

  useEffect(() => {
    loadHome()
    loadContents()
    loadUser()
    loadBoards()
    loadWorldServerStatus()
  }, [loadBoards, loadContents, loadHome, loadUser, loadWorldServerStatus])

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadWorldServerStatus().catch(() => {})
    }, 30000)
    return () => window.clearInterval(timer)
  }, [loadWorldServerStatus])

  useEffect(() => {
    if (!user) return undefined
    loadNotifications().catch(() => {
      setDropdownNotifications([])
      setNotificationUnreadCount(0)
    })
    const timer = window.setInterval(() => {
      loadNotifications(true).catch(() => {})
    }, 30000)
    const reloadNotifications = () => {
      loadNotifications(true).catch(() => {})
    }
    window.addEventListener('focus', reloadNotifications)
    document.addEventListener('visibilitychange', reloadNotifications)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', reloadNotifications)
      document.removeEventListener('visibilitychange', reloadNotifications)
    }
  }, [loadNotifications, user])

  useEffect(() => {
    if (!user || screen !== 'notifications') return
    loadNotificationCenter(notificationPage, notificationSearch, notificationCategory).catch(async (error) => {
      await showAlert(error?.message || '알림 목록을 불러오지 못했습니다.')
    })
  }, [loadNotificationCenter, notificationCategory, notificationPage, notificationSearch, screen, showAlert, user])

  useEffect(() => {
    if (!userLoaded) return
    if (user) return
    window.location.replace('/login/')
  }, [user, userLoaded])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const nextBoardId = params.get('board') || ''
    const nextPostId = Number(params.get('post') || 0)
    const wantsWrite = params.get('write') === '1'
    const nextView = params.get('view') || ''

    if (!nextBoardId) {
      setBoardId('')
      if (nextView === 'mypage' && user) setScreen('mypage')
      else if (nextView === 'notifications' && user) setScreen('notifications')
      else if (nextView === 'connect') setScreen('connect')
      else if (nextView === 'rules') setScreen('rules')
      else if (nextView === 'contents') {
        setScreen('contents')
        setSelectedContent(params.get('content') || '')
      }
      else if (nextView === 'auction') setScreen('auction')
      else setScreen('home')
      setDetail(null)
      return
    }

    if (!boards.length) return

    const matchedBoard = boards.find((board) => board.id === nextBoardId)
    if (!matchedBoard) {
      setBoardId('')
      setScreen('home')
      setDetail(null)
      return
    }

    setBoardId(nextBoardId)
    if (nextPostId > 0) {
      openPost(nextPostId).catch((error) => { void showAlert(error?.message || '게시글을 불러오지 못했습니다.') })
      return
    }
    setScreen(wantsWrite ? 'write' : 'list')
  }, [boards, location.search, openPost, showAlert, user])

  useEffect(() => {
    scrollToPageTop()
  }, [location.pathname, location.search])

  useEffect(() => {
    if (screen !== 'detail') return
    const params = new URLSearchParams(location.search)
    const commentId = Number(params.get('comment_id') || 0)
    const useLatestComment = !commentId && commentHighlightRequest.fallbackLatest
    if (!commentId && !useLatestComment) return
    let attempts = 0
    let clearHighlightTimer = 0
    let retryTimer = 0
    let flashTimers = []
    const highlightComment = () => {
      const target = commentId
        ? document.getElementById(`comment-${commentId}`)
        : Array.from(document.querySelectorAll('[id^="comment-"]')).pop()
      if (!target) {
        attempts += 1
        if (attempts < 20) {
          retryTimer = window.setTimeout(highlightComment, 150)
        }
        return
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.remove('comment-focus-highlight')
      void target.offsetWidth
      flashTimers.forEach((timerId) => window.clearTimeout(timerId))
      flashTimers = []
      const originalStyle = {
        background: target.style.background,
        borderColor: target.style.borderColor,
        boxShadow: target.style.boxShadow,
        transform: target.style.transform,
      }
      const applyFlash = (active) => {
        if (active) {
          target.style.setProperty('background', '#5a3f0e', 'important')
          target.style.setProperty('border-color', '#ffd777', 'important')
          target.style.setProperty('box-shadow', '0 0 0 2px rgba(255, 215, 119, 0.7), 0 0 34px rgba(255, 215, 119, 0.42)', 'important')
          target.style.setProperty('transform', 'translateY(-1px)', 'important')
          return
        }
        target.style.setProperty('background', originalStyle.background)
        target.style.setProperty('border-color', originalStyle.borderColor)
        target.style.setProperty('box-shadow', originalStyle.boxShadow)
        target.style.setProperty('transform', originalStyle.transform)
      }
      for (let index = 0; index < 12; index += 1) {
        flashTimers.push(window.setTimeout(() => applyFlash(index % 2 === 0), index * 290))
      }
      clearHighlightTimer = window.setTimeout(() => {
        applyFlash(false)
        target.classList.remove('comment-focus-highlight')
      }, 3800)
    }
    retryTimer = window.setTimeout(highlightComment, 180)
    return () => {
      window.clearTimeout(retryTimer)
      window.clearTimeout(clearHighlightTimer)
      flashTimers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [commentHighlightRequest, detail, location.search, screen])

  useEffect(() => {
    if (!boardId || screen !== 'list') return
    loadPosts(boardId, page, search).catch((error) => { void showAlert(error?.message || '게시글을 불러오지 못했습니다.') })
  }, [boardId, loadPosts, page, screen, search, showAlert])
  useEffect(() => {
    if (!currentBoard || canRead(currentBoard, user)) return
    setBoardId('')
    setScreen('home')
    navigate('/', { replace: true })
  }, [currentBoard, navigate, user])

  useEffect(() => {
    if (!userMenuOpen && !notificationOpen) return undefined
    const handlePointerDown = (event) => {
      const clickedUserMenu = userMenuRef.current?.contains(event.target)
      const clickedNotificationMenu = notificationMenuRef.current?.contains(event.target)
      if (!clickedUserMenu) setUserMenuOpen(false)
      if (!clickedNotificationMenu) setNotificationOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [notificationOpen, userMenuOpen])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 980) setMobileNavOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handleAlert = (event) => {
      const detail = event?.detail || {}
      void showAlert(detail.message || '', detail.title || '안내')
    }
    window.addEventListener('karazhan:alert', handleAlert)
    return () => window.removeEventListener('karazhan:alert', handleAlert)
  }, [showAlert])

  useEffect(() => {
    if (screen !== 'mypage' || !user) return
    loadMyPageCharacters().catch((error) => { void showAlert(error?.message || '캐릭터 목록을 불러오지 못했습니다.') })
  }, [loadMyPageCharacters, screen, showAlert, user])

  useEffect(() => {
    if (screen !== 'mypage' || !user) return
    loadMyPagePointHistory(myPagePointPage).catch((error) => { void showAlert(error?.message || '포인트 내역을 불러오지 못했습니다.') })
  }, [loadMyPagePointHistory, myPagePointPage, screen, showAlert, user])

  useEffect(() => {
    if (screen !== 'auction' || !user) return
    loadAuctionCharacters().catch((error) => { void showAlert(error?.message || '경매장 캐릭터를 불러오지 못했습니다.') })
  }, [loadAuctionCharacters, screen, showAlert, user])

  useEffect(() => {
    if (screen !== 'auction' || !user) return
    if (auctionTab === 'list') {
      loadAuctionList(auctionPage, auctionSearch, auctionStatus).catch((error) => { void showAlert(error?.message || '경매 목록을 불러오지 못했습니다.') })
    } else if (auctionTab === 'my') {
      loadAuctionMyList(auctionMyPage).catch((error) => { void showAlert(error?.message || '내 경매 목록을 불러오지 못했습니다.') })
    }
  }, [auctionMyPage, auctionPage, auctionSearch, auctionStatus, auctionTab, loadAuctionList, loadAuctionMyList, screen, showAlert, user])

  useEffect(() => {
    if (screen !== 'auction' || !user || auctionTab !== 'create') return
    loadAuctionCreateItems(auctionCreateCharGuid).catch((error) => { void showAlert(error?.message || '등록 가능한 아이템을 불러오지 못했습니다.') })
  }, [auctionCreateCharGuid, auctionTab, loadAuctionCreateItems, screen, showAlert, user])

  useEffect(() => {
    const entries = new Set()
    auctionRows.forEach((row) => { if (Number(row.item_entry || 0) > 0) entries.add(Number(row.item_entry)) })
    auctionMyRows.forEach((row) => { if (Number(row.item_entry || 0) > 0) entries.add(Number(row.item_entry)) })
    auctionCreateItems.forEach((item) => { if (Number(item.item_entry || 0) > 0) entries.add(Number(item.item_entry)) })
    const unresolved = Array.from(entries).filter((entry) => !auctionIconMap[entry])
    if (!unresolved.length) return
    let cancelled = false
    Promise.all(unresolved.map(async (entry) => {
      try {
        const response = await fetch(`/api/external/item_icon?entry=${entry}`, { credentials: 'same-origin' })
        if (!response.ok) return [entry, '']
        const data = await response.json()
        return [entry, String(data?.url || '').trim()]
      } catch {
        return [entry, '']
      }
    })).then((results) => {
      if (cancelled) return
      setAuctionIconMap((prev) => {
        const next = { ...prev }
        results.forEach(([entry, url]) => {
          if (url) next[entry] = url
        })
        return next
      })
    })
    return () => { cancelled = true }
  }, [auctionCreateItems, auctionIconMap, auctionMyRows, auctionRows])

  useEffect(() => {
    if (!visibleBoards.length) {
      setNoticePreviewPosts([])
      setCommunityPreviewPosts([])
      return
    }
    loadHomeBoardPreviews(visibleBoards).catch(() => {
      setNoticePreviewPosts([])
      setCommunityPreviewPosts([])
    })
  }, [loadHomeBoardPreviews, visibleBoards])

  const openBoard = useCallback(
    (nextBoardId) => {
      if (!nextBoardId) return
      setUserMenuOpen(false)
      setMobileNavOpen(false)
      resetWriteState()
      setDetail(null)
      setCommentInput('')
      setReplyTarget(null)
      setPage(1)
      setSearch('')
      setSearchInput('')
      navigate(`/?board=${encodeURIComponent(nextBoardId)}`)
    },
    [navigate, resetWriteState],
  )

  const goHome = useCallback(() => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setPage(1)
    setSearch('')
    setSearchInput('')
    setScreen('home')
    navigate('/')
  }, [navigate, resetWriteState])

  const openConnectGuide = useCallback(() => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setPage(1)
    setSearch('')
    setSearchInput('')
    setScreen('connect')
    navigate('/?view=connect')
  }, [navigate, resetWriteState])

  const openServerRules = useCallback(() => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setPage(1)
    setSearch('')
    setSearchInput('')
    setScreen('rules')
    navigate('/?view=rules')
  }, [navigate, resetWriteState])

  const openContents = useCallback(() => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setSearch('')
    setSearchInput('')
    setSelectedContent('')
    setScreen('contents')
    navigate('/?view=contents')
  }, [navigate, resetWriteState])

  const openAuction = useCallback(() => {
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setSearch('')
    setSearchInput('')
    setScreen('auction')
    setAuctionTab('list')
    navigate('/?view=auction')
  }, [navigate, resetWriteState])

  const openContentDetail = useCallback((contentId) => {
    const target = contentItems.find((item) => item.id === contentId)
    if (!target) return
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setSearch('')
    setSearchInput('')
    setSelectedContent(contentId)
    setScreen('contents')
    navigate(`/?view=contents&content=${encodeURIComponent(contentId)}`)
  }, [contentItems, navigate, resetWriteState])

  const openWrite = useCallback(async () => {
    if (!currentBoard || !canWrite(currentBoard, user)) {
      await showAlert(TEXT.writeDenied)
      return
    }
    if (!isAdmin(user) && !hasRepresentativeCharacter(user)) {
      await showAlert('대표 캐릭터를 설정해야 글을 작성할 수 있습니다.')
      return
    }
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    resetWriteState()
    setDetail(null)
    setScreen('write')
    navigate(`/?board=${encodeURIComponent(currentBoard.id)}&write=1`)
  }, [currentBoard, navigate, resetWriteState, showAlert, user])

  const openMyPage = useCallback(() => {
    if (!user) {
      window.location.href = '/login/'
      return
    }
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    resetWriteState()
    setScreen('mypage')
    setMyPagePointPage(1)
    navigate('/?view=mypage')
  }, [navigate, resetWriteState, user])

  const openNotifications = useCallback(() => {
    if (!user) return
    setUserMenuOpen(false)
    setNotificationOpen(false)
    setMobileNavOpen(false)
    setBoardId('')
    setDetail(null)
    setCommentInput('')
    setReplyTarget(null)
    setNotificationPage(1)
    setNotificationSearch('')
    setNotificationSearchInput('')
    setNotificationCategory('')
    setScreen('notifications')
    navigate('/?view=notifications')
  }, [navigate, user])

  const beginEdit = useCallback(() => {
    if (!detail?.post || !currentBoard || !canEditOwner(detail.post, user)) return
    setUserMenuOpen(false)
    setMobileNavOpen(false)
    setEditingId(Number(detail.post.id || 0))
    setTitle(detail.post.title || '')
    setContent(detail.post.content || '')
    setInquiryCategory(detail.post.category || '')
    setPromotionUrls(asArray(detail.post.promotion_urls).length ? asArray(detail.post.promotion_urls) : [''])
    setSponsorAgree(false)
    setSponsorName('')
    setSponsorAmount('')
    setScreen('write')
    navigate(`/?board=${encodeURIComponent(currentBoard.id)}&write=1&edit=${detail.post.id}`)
  }, [currentBoard, detail, navigate, user])

  const savePost = useCallback(async () => {
    if (!currentBoard) return
    if (!isAdmin(user) && !hasRepresentativeCharacter(user)) {
      await showAlert('대표 캐릭터를 설정해야 글을 작성할 수 있습니다.')
      return
    }
    if (!title.trim()) {
      await showAlert(TEXT.titleRequired)
      return
    }

    const payload = { title: title.trim(), content, category: '', promotion_urls: [] }

    if (isSupportBoard) {
      if (!inquiryCategory) {
        await showAlert(isBugReportBoard ? '오류 유형을 선택해 주세요.' : '문의 카테고리를 선택해 주세요.')
        return
      }
      payload.category = inquiryCategory
      if (isInquiryBoard && inquiryCategory === '후원' && !editingId) {
        if (!sponsorAgree) {
          await showAlert('후원 안내 동의가 필요합니다.')
          return
        }
        if (!sponsorName.trim() || !sponsorAmount.trim()) {
          await showAlert('후원자명과 후원 금액을 입력해 주세요.')
          return
        }
        payload.content = `${content}<hr><p><strong>[후원 입금 정보]</strong></p><p>후원자명: ${sponsorName}</p><p>후원금액: ${Number(sponsorAmount).toLocaleString()}원</p>`
      }
    }

    if (isPromotionBoard) {
      const urls = promotionUrls.map((item) => String(item || '').trim()).filter(Boolean)
      if (!urls.length) {
        await showAlert('홍보 URL을 1개 이상 입력해 주세요.')
        return
      }
      payload.content = ''
      payload.promotion_urls = urls
    } else if (!String(payload.content || '').trim() || payload.content === '<p><br></p>') {
      await showAlert(TEXT.contentRequired)
      return
    }

    const endpoint = editingId ? '/api/board/post/update' : '/api/board/post/create'
    const requestBody = editingId ? { id: editingId, ...payload } : { board_id: currentBoard.id, ...payload }
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(requestBody) })

    resetWriteState()
    setScreen('list')
    setPage(1)
    setSearch('')
    setSearchInput('')
    navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)
    await loadPosts(currentBoard.id, 1, '')
  }, [content, currentBoard, editingId, inquiryCategory, isBugReportBoard, isInquiryBoard, isPromotionBoard, isSupportBoard, loadPosts, navigate, promotionUrls, resetWriteState, showAlert, sponsorAgree, sponsorAmount, sponsorName, title, user])

  const deletePost = useCallback(async () => {
    if (!detail?.post?.id) return
    const confirmed = await showConfirm('게시글을 삭제하시겠습니까?')
    if (!confirmed) return
    await apiFetch(`/api/board/post/delete?id=${detail.post.id}`, { method: 'POST', headers: { Accept: 'application/json' } })
    setDetail(null)
    setScreen('list')
    navigate(`/?board=${encodeURIComponent(currentBoard?.id || '')}`)
    if (currentBoard?.id) await loadPosts(currentBoard.id, page, search)
  }, [currentBoard, detail, loadPosts, navigate, page, search, showConfirm])

  const comments = isSupportBoard ? asArray(detail?.inquiry_messages) : asArray(detail?.comments)
  const latestSupportMessage = comments.length ? comments[comments.length - 1] : null
  const canUserReplyBugReport = isBugReportBoard && String(detail?.post?.inquiry_status || '').toLowerCase() !== 'done' && String(latestSupportMessage?.role || '').toLowerCase() === 'staff'

  const submitComment = useCallback(async () => {
    if (!detail?.post?.id || !commentInput.trim()) return
    if (!isAdmin(user) && !hasRepresentativeCharacter(user)) {
      await showAlert('대표 캐릭터를 설정해야 댓글을 작성할 수 있습니다.')
      return
    }
    if (isSupportBoard) {
      if (!isBugReportBoard) {
        await showAlert('문의 게시판 답변은 문의 관리 화면에서 처리됩니다.')
        return
      }
      if (String(detail.post.inquiry_status || '').toLowerCase() === 'done') {
        await showAlert('완료된 리포트에는 답글을 등록할 수 없습니다.')
        return
      }
      if (String(latestSupportMessage?.role || '').toLowerCase() !== 'staff') {
        await showAlert('관리자 답글 이후에 추가 답글을 등록할 수 있습니다.')
        return
      }
      await apiFetch('/api/board/inquiry/message/create', {
        method: 'POST',
        body: JSON.stringify({ post_id: Number(detail.post.id), content: commentInput.trim() }),
      })
      setCommentInput('')
      await openPost(detail.post.id)
      return
    }
    const payload = {
      post_id: detail.post.id,
      content: commentInput.trim(),
      ...(replyTarget?.id ? { parent_id: Number(replyTarget.id) } : {}),
    }
    await apiFetch('/api/board/comment/create', { method: 'POST', body: JSON.stringify(payload) })
    setCommentInput('')
    setReplyTarget(null)
    await openPost(detail.post.id)
  }, [commentInput, detail, isBugReportBoard, isSupportBoard, latestSupportMessage, openPost, replyTarget, showAlert, user])

  const deleteComment = useCallback(async (commentId) => {
    const confirmed = await showConfirm('댓글을 삭제하시겠습니까?')
    if (!confirmed) return
    await apiFetch(`/api/board/comment/delete?id=${commentId}`, { method: 'POST', headers: { Accept: 'application/json' } })
    if (detail?.post?.id) await openPost(detail.post.id)
  }, [detail, openPost, showConfirm])

  const updatePromotionUrl = useCallback((index, value) => {
    setPromotionUrls((prev) => prev.map((item, currentIndex) => (currentIndex === index ? value : item)))
  }, [])

  const removePromotionUrl = useCallback((index) => {
    setPromotionUrls((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index)
      return next.length ? next : ['']
    })
  }, [])

  const addPromotionUrl = useCallback(() => {
    setPromotionUrls((prev) => [...prev, ''])
  }, [])

  const hasMainCharacter = Boolean(user?.mainCharacter?.guid && user?.mainCharacter?.name)
  const welcomeName = hasMainCharacter ? (user?.mainCharacter?.name || user?.username || '방문자') : (user?.username || '방문자')
  const headerWelcomeText = hasMainCharacter ? `${welcomeName}${TEXT.welcome}` : '대표 캐릭터를 설정해주세요'
  const raceIcon = getRaceIcon(user?.mainCharacter?.race, user?.mainCharacter?.gender)
  const myPagePointFillCount = Math.max(0, 20 - myPagePointLogs.length)

  const handleLogout = useCallback(async () => {
    setUserMenuOpen(false)
    setNotificationOpen(false)
    setMobileNavOpen(false)
    await apiFetch('/api/logout', { method: 'POST', headers: { Accept: 'application/json' } })
    window.location.href = '/'
  }, [])

  const markNotificationRead = useCallback(async (notificationId) => {
    await apiFetch('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ id: Number(notificationId || 0), all: false }),
    })
  }, [])

  const markAllNotificationsRead = useCallback(async () => {
    if (!dropdownNotifications.length && !notifications.length) return
    await apiFetch('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    })
    await loadNotifications(true)
  }, [dropdownNotifications.length, loadNotifications, notifications.length])

  const openNotificationTarget = useCallback(async (notification) => {
    if (!notification?.id) return
    setNotificationOpen(false)
    if (!notification.is_read) {
      try {
        await markNotificationRead(notification.id)
      } catch {
        // Ignore and continue navigation.
      }
    }
    setDropdownNotifications((prev) => prev.map((item) => (
      Number(item.id) === Number(notification.id) ? { ...item, is_read: true } : item
    )))
    setNotifications((prev) => prev.map((item) => (
      Number(item.id) === Number(notification.id) ? { ...item, is_read: true } : item
    )))
    setNotificationUnreadCount((prev) => Math.max(0, prev - (notification.is_read ? 0 : 1)))
    const link = String(notification.link || '').trim()
    if (!link) {
      loadNotifications(true).catch(() => {})
      return
    }
    if (link.startsWith('/admin')) {
      window.location.href = link
      return
    }
    if (link.startsWith('/board/view')) {
      try {
        const legacyUrl = new URL(link, window.location.origin)
        const postId = Number(legacyUrl.searchParams.get('id') || 0)
        const commentId = Number(legacyUrl.searchParams.get('comment_id') || 0)
        if (postId > 0) {
          const postDetail = await apiFetch(`/api/board/post?id=${postId}`)
          const nextBoardId = String(postDetail?.post?.board_id || '')
          if (nextBoardId) {
            const nextUrl = `/?board=${encodeURIComponent(nextBoardId)}&post=${postId}${commentId > 0 ? `&comment_id=${commentId}` : ''}`
            setCommentHighlightRequest((prev) => ({ tick: prev.tick + 1, fallbackLatest: commentId <= 0 }))
            navigate(nextUrl)
            return
          }
        }
      } catch {
        // Fall back to the original link below.
      }
      window.location.href = link
      return
    }
    if (link.startsWith('/?') || link.startsWith('/')) {
      try {
        const targetUrl = new URL(link, window.location.origin)
        const hasPostTarget = Number(targetUrl.searchParams.get('post') || 0) > 0
        const commentId = Number(targetUrl.searchParams.get('comment_id') || 0)
        if (String(notification.type || '').toLowerCase() === 'comment' && hasPostTarget) {
          setCommentHighlightRequest((prev) => ({ tick: prev.tick + 1, fallbackLatest: commentId <= 0 }))
        }
      } catch {
        // Ignore malformed internal links and continue navigation.
      }
      navigate(link)
      return
    }
    window.location.href = link
  }, [loadNotifications, markNotificationRead, navigate])

  const handleHeaderNav = useCallback(
    (item) => {
      if (!item) return
      if (item.url.startsWith('/')) {
        setUserMenuOpen(false)
        setMobileNavOpen(false)
        window.location.href = item.url
        return
      }
      if (item.label === TEXT.connect) {
        openConnectGuide()
        return
      }
      if (item.label === TEXT.rules) {
        openServerRules()
        return
      }
      if (item.label === TEXT.contents) {
        openContents()
        return
      }
      if (item.label === TEXT.auction) {
        openAuction()
        return
      }
      if (boardId || screen !== 'home') {
        goHome()
        window.setTimeout(() => {
          document.querySelector(item.url)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 120)
        return
      }
      setUserMenuOpen(false)
      setMobileNavOpen(false)
      window.requestAnimationFrame(() => {
        document.querySelector(item.url)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [boardId, goHome, openAuction, openConnectGuide, openContents, openServerRules, screen],
  )

  const renderHeaderNavAction = useCallback((item, keyPrefix = 'desktop') => {
    if (!item) return null
    const children = Array.isArray(item.children) ? item.children.filter(Boolean) : []
    if (children.length) {
      return (
        <span key={`${keyPrefix}-${item.label}-${item.url}`} className="nav-dropdown">
          <button
            type="button"
            className="nav-link-button"
            onClick={() => handleHeaderNav(item)}
          >
            {item.label}
          </button>
          <span className="board-dropdown-menu">
            {children.map((child) => (
              <button
                key={`${keyPrefix}-child-${child.label}-${child.url}`}
                type="button"
                className="board-dropdown-item"
                onClick={() => handleHeaderNav(child)}
              >
                {child.label}
              </button>
            ))}
          </span>
        </span>
      )
    }

    if (String(item.url || '').startsWith('/')) {
      return <a key={`${keyPrefix}-${item.label}-${item.url}`} href={item.url}>{item.label}</a>
    }

    return (
      <button
        key={`${keyPrefix}-${item.label}-${item.url}`}
        type="button"
        className="nav-link-button"
        onClick={() => handleHeaderNav(item)}
      >
        {item.label}
      </button>
    )
  }, [handleHeaderNav])

  const handleSetMainCharacter = useCallback(async (character) => {
    if (!character?.guid) return
    const confirmed = await showConfirm(`'${character.name}' 캐릭터를 대표 캐릭터로 설정하시겠습니까?`)
    if (!confirmed) return
    await apiFetch('/api/user/main_character', {
      method: 'POST',
      body: JSON.stringify({ guid: character.guid, name: character.name }),
    })
    await loadUser()
    await loadMyPageCharacters()
  }, [loadMyPageCharacters, loadUser, showConfirm])

  if (!userLoaded || !user) return <GlobalLoadingOverlay visible={globalLoadingVisible || !userLoaded} message={globalLoadingMessage} />

  return (
    <div className="page react-home-page">
      <GlobalLoadingOverlay visible={globalLoadingVisible} message={globalLoadingMessage} />
      <header className="topbar">
        <nav className="nav" aria-label="주요 메뉴">
          <button className="nav-brand nav-link-button" type="button" onClick={goHome}>The Karazhan</button>
          <button
            type="button"
            className={`nav-mobile-toggle button-reset${mobileNavOpen ? ' active' : ''}`}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-panel"
            aria-label="모바일 메뉴 열기"
            onClick={() => {
              setUserMenuOpen(false)
              setMobileNavOpen((prev) => !prev)
            }}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="nav-links">
            <span className="nav-dropdown">
              <button type="button" className="nav-link-button" onClick={() => openBoard(visibleBoards[0]?.id)}>{TEXT.board}</button>
              <span className="board-dropdown-menu">
                {visibleBoards.length ? visibleBoards.map((board) => (
                  <button key={board.id} type="button" className="board-dropdown-item" onClick={() => openBoard(board.id)}>{board.name}</button>
                )) : <span className="board-dropdown-empty">{TEXT.loadingBoards}</span>}
              </span>
            </span>
            {headerNavItems.map((item) => renderHeaderNavAction(item))}
          </div>
          {user ? (
            <div className="nav-user-zone">
              <div className="nav-notification-wrap" ref={notificationMenuRef}>
                <button
                  type="button"
                  className="nav-notification-btn button-reset"
                  aria-label="알림 열기"
                  aria-expanded={notificationOpen}
                  onClick={() => {
                    setUserMenuOpen(false)
                    setNotificationOpen((prev) => !prev)
                  }}
                >
                  <span className="nav-notification-icon" aria-hidden="true">🔔</span>
                  {notificationUnreadCount > 0 ? <span className="nav-notification-badge">{Math.min(notificationUnreadCount, 99)}</span> : null}
                </button>
                {notificationOpen ? (
                  <div className="nav-notification-menu">
                    <div className="nav-notification-head">
                      <div>
                        <strong>알림</strong>
                        <span>새 알림 {notificationUnreadCount}개</span>
                      </div>
                      <div className="nav-notification-head-actions">
                        <button type="button" className="button-reset nav-notification-readall" onClick={openNotifications}>
                          전체보기
                        </button>
                        <button type="button" className="button-reset nav-notification-readall" onClick={() => { void markAllNotificationsRead() }}>
                          모두 읽음
                        </button>
                      </div>
                    </div>
                    <div className="nav-notification-list">
                      {notificationLoading ? <div className="nav-notification-empty">알림을 불러오는 중입니다.</div> : null}
                      {!notificationLoading && !dropdownNotifications.length ? <div className="nav-notification-empty">새로운 알림이 없습니다.</div> : null}
                      {!notificationLoading ? dropdownNotifications.map((notification) => {
                        const meta = notificationTypeMeta(notification.type)
                        return (
                          <button
                            key={`notification-${notification.id}`}
                            type="button"
                            className={`button-reset nav-notification-item${notification.is_read ? '' : ' unread'}`}
                            onClick={() => { void openNotificationTarget(notification) }}
                          >
                            <span className={`nav-notification-type ${meta.className}`} aria-hidden="true">{meta.icon}</span>
                            <span className="nav-notification-copy">
                              <strong>{notification.title || '알림'}</strong>
                              <span>{notification.message || ''}</span>
                              <time>{formatNotificationTime(notification.created_at)}</time>
                            </span>
                          </button>
                        )
                      }) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="nav-user-wrap" ref={userMenuRef}>
                <button
                  type="button"
                  className="nav-user button-reset"
                  onClick={() => {
                    setNotificationOpen(false)
                    setUserMenuOpen((prev) => !prev)
                  }}
                >
                  <img className="nav-user-avatar" src={raceIcon} alt={hasMainCharacter ? `${welcomeName} 종족 아이콘` : '대표 캐릭터 미설정'} />
                  <span className="nav-user-text">{headerWelcomeText}</span>
                </button>
                {userMenuOpen ? (
                  <div className="nav-user-menu">
                    {isAdmin(user) ? <a href="/admin" onClick={() => setUserMenuOpen(false)}>관리자</a> : null}
                    <button type="button" className="button-reset" onClick={openMyPage}>마이페이지</button>
                    <button type="button" className="button-reset" onClick={handleLogout}>로그아웃</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </nav>
        {mobileNavOpen ? <button type="button" className="nav-mobile-overlay button-reset" aria-label="모바일 메뉴 닫기" onClick={() => setMobileNavOpen(false)} /> : null}
        <div id="mobile-nav-panel" className={`nav-mobile-panel${mobileNavOpen ? ' active' : ''}`}>
          <div className="nav-mobile-section">
            <div className="nav-mobile-title">{TEXT.board}</div>
            <div className="nav-mobile-board-list">
              {visibleBoards.length ? visibleBoards.map((board) => (
                <button key={`mobile-board-${board.id}`} type="button" className="nav-mobile-link" onClick={() => openBoard(board.id)}>
                  {board.name}
                </button>
              )) : <span className="board-dropdown-empty">{TEXT.loadingBoards}</span>}
            </div>
          </div>
          <div className="nav-mobile-section">
            {headerNavItems.map((item) => {
              const children = Array.isArray(item.children) ? item.children.filter(Boolean) : []
              if (children.length) {
                return (
                  <div key={`mobile-group-${item.label}-${item.url}`} className="nav-mobile-submenu">
                    <button type="button" className="nav-mobile-link nav-mobile-parent" onClick={() => handleHeaderNav(item)}>
                      {item.label}
                    </button>
                    <div className="nav-mobile-submenu-list">
                      {children.map((child) => (
                        <button
                          key={`mobile-child-${child.label}-${child.url}`}
                          type="button"
                          className="nav-mobile-link nav-mobile-child"
                          onClick={() => handleHeaderNav(child)}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }
              if (String(item.url || '').startsWith('/')) {
                return <a key={`mobile-${item.label}-${item.url}`} className="nav-mobile-link" href={item.url} onClick={() => setMobileNavOpen(false)}>{item.label}</a>
              }
              return (
                <button key={`mobile-${item.label}-${item.url}`} type="button" className="nav-mobile-link" onClick={() => handleHeaderNav(item)}>
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main>
        {!boardId && screen === 'home' && (
          <>
            <section className="hero" aria-label="카라잔 소개" style={{ '--public-hero-bg': `url(${home.hero.background})` }}>
              <div className="hero-video-wrap" aria-hidden="true">
                <video className="hero-video" autoPlay muted loop playsInline preload="auto">
                  <source src="/img/bg.mp4" type="video/mp4" />
                </video>
              </div>
              <div className="hero-inner">
                <article className={`server-card hero-server-status ${worldServerOnline === false ? 'offline' : worldServerOnline === null ? 'checking' : 'online'}`}>
                  <div className="hero-server-badge">
                    <span className={`hero-server-dot ${worldServerOnline === false ? 'off' : ''}`} />
                    {worldServerOnline === null ? 'WORLD SERVER CHECKING' : worldServerOnline ? 'WORLD SERVER ONLINE' : 'WORLD SERVER OFFLINE'}
                  </div>
                  <h2>{worldServerOnline === null ? '서버 상태를 확인 중입니다' : worldServerOnline ? '카라잔 서버가 열려 있습니다' : '현재 서버가 닫혀 있습니다'}</h2>
                  <p>{worldServerOnline === false ? '점검 또는 재시작 중일 수 있습니다. 잠시 후 다시 확인해 주세요.' : '현재 접속 가능 상태입니다. 접속 방법을 확인하고 바로 모험을 시작하세요.'}</p>
                  <div className="hero-server-meta">
                    <span>최근 갱신</span>
                    <strong>{worldStatusUpdatedAt || '대기 중'}</strong>
                  </div>
                </article>
              </div>
            </section>

            <section className="section">
              <div className="section-title">새로운 도전</div>
              <div className="challenge-grid">
                <article className="challenge-card" style={{ '--bg-img': "url('/img/shop_bg.jpg')" }}><span className="card-number">01</span><div className="challenge-content"><h3>그림자 시련</h3><p>내 캐릭터의 한계를 시험하고 단계별 기록을 갱신해 보세요.</p><a className="btn btn-small" href="#">자세히 보기</a></div></article>
                <article className="challenge-card" style={{ '--bg-img': "url('/img/carddraw.png')" }}><span className="card-number">02</span><div className="challenge-content"><h3>장비 강화 시스템</h3><p>에테르 강화 정보와 재료 흐름을 확인하고 준비해 보세요.</p><a className="btn btn-small" href="#">자세히 보기</a></div></article>
                <article className="challenge-card" style={{ '--bg-img': "url('/img/hearthstone-heroes-warcraft-2015-04-27.webp')" }}><span className="card-number">03</span><div className="challenge-content"><h3>인스턴스 보너스 미션</h3><p>던전 플레이에 새로운 보상과 목표를 더해 보세요.</p><a className="btn btn-small" href="#">자세히 보기</a></div></article>
              </div>
            </section>
            <section id="notice-section" className="section content-grid">
              <article className="panel">
                <div className="panel-head"><h2>공지사항</h2><button type="button" className="more button-reset" onClick={() => openBoard(noticeBoard?.id || visibleBoards[0]?.id)}>더보기 &gt;</button></div>
                <ul className="notice-list">
                  {noticePreviewPosts.length ? noticePreviewPosts.map((item) => {
                    const tag = getBoardPreviewTag(item.board_name)
                    return (
                      <li key={`notice-${item.id}`} onClick={() => navigate(`/?board=${encodeURIComponent(item.board_id || noticeBoard?.id || '')}&post=${item.id}`)}>
                        <span className={`tag ${tag.className}`}>{tag.label}</span>
                        <span>{item.title}</span>
                        <span className="date">{formatShortDate(item.created_at)}</span>
                      </li>
                    )
                  }) : (
                    <li><span className="tag notice">공지</span><span>공지 게시판의 최신글이 없습니다.</span><span className="date">-</span></li>
                  )}
                </ul>
              </article>
              <article id="contents-section" className="panel">
                <div className="panel-head"><h2>컨텐츠</h2><button type="button" className="more button-reset" onClick={openContents}>더보기 &gt;</button></div>
                <div className="guide-grid">
                  {contentItems.map((item) => (
                    <button key={item.id} type="button" className="guide-card guide-card-button" onClick={() => openContentDetail(item.id)}>
                      <div className="guide-thumb" style={{ '--bg-img': `url('${item.image}')` }}></div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </button>
                  ))}
                  {!contentItems.length ? <p className="board-empty">등록된 컨텐츠가 없습니다.</p> : null}
                </div>
              </article>
            </section>

            <section id="community-section" className="section lower-grid">
              <article className="panel">
                <div className="panel-head"><h2>커뮤니티</h2><button type="button" className="more button-reset" onClick={() => openBoard(freeBoard?.id || visibleBoards[0]?.id)}>더보기 &gt;</button></div>
                <div className="tabs"><span className="tab active">자유게시판</span></div>
                <ul className="community-list">
                  {communityPreviewPosts.length ? communityPreviewPosts.map((item) => (
                    <li key={`community-${item.board_id}-${item.id}`} onClick={() => navigate(`/?board=${encodeURIComponent(item.board_id)}&post=${item.id}`)}>
                      <span>{item.title}</span>
                      <span className="community-board-name">자유게시판</span>
                      <span className="like">{formatShortDate(item.created_at)}</span>
                    </li>
                  )) : (
                    <li><span>자유게시판의 최신글이 없습니다.</span><span className="community-board-name">자유게시판</span><span className="like">-</span></li>
                  )}
                </ul>
              </article>
              <article className="panel">
                <div className="panel-head"><h2>업데이트</h2><button type="button" className="more button-reset" onClick={() => {
                  const updateBoard = visibleBoards.find((board) => board.name.includes('업데이트'))
                  openBoard(updateBoard?.id || visibleBoards[0]?.id)
                }}>더보기 &gt;</button></div>
                {mediaPreviewPosts.length ? (
                  <ul className="notice-list media-notice-list">
                    {mediaPreviewPosts.slice(0, 5).map((item) => (
                      <li key={`media-${item.id}`} onClick={() => navigate(`/?board=${encodeURIComponent(item.board_id)}&post=${item.id}`)}>
                        <span className="tag update">업데이트</span>
                        <span>{item.title}</span>
                        <span className="date">{formatShortDate(item.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="notice-list media-notice-list">
                    <li><span className="tag update">업데이트</span><span>업데이트 게시판의 최신글이 없습니다.</span><span className="date">-</span></li>
                  </ul>
                )}
              </article>
              <aside id="connect-section" className="panel start-panel"><h2>지금, 모험을 시작하세요</h2><p>접속기 설치, 계정 안내, 초기 설정까지 필요한 순서를 확인하고 바로 입장해 보세요.</p><button type="button" className="btn" onClick={openConnectGuide}>접속 가이드 보기</button></aside>
            </section>
          </>
        )}

        {!boardId && screen === 'connect' ? (
          <section className="section">
            <div className="guide-view-shell">
              <div className="guide-view-head">
                <h2>접속방법</h2>
              </div>
              <div className="guide-view-body">
                <div className="guide-view-image-wrap">
                  <img src="/img/guide.png?v=20260417_1" alt="접속방법 안내" className="guide-view-image" />
                  <a
                    href={CONNECT_CLIENT_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="guide-download-hitbox guide-download-hitbox-first"
                    aria-label="게임 클라이언트 다운로드"
                  />
                  <a
                    href={CONNECT_LAUNCHER_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="guide-download-hitbox guide-download-hitbox-second"
                    aria-label="접속기 다운로드"
                  />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'rules' ? (
          <section className="section">
            <div className="guide-view-shell">
              <div className="guide-view-head">
                <h2>서버규칙</h2>
              </div>
              <div className="guide-view-body">
                <div className="guide-view-image-wrap">
                  <img src={SERVER_RULES_IMAGE_URL} alt="서버규칙 안내" className="guide-view-image" />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'contents' ? (
          <section className="section">
            {!selectedContent || !selectedContentItem ? (
              <div className="guide-view-shell">
                <div className="guide-view-head">
                  <h2>컨텐츠</h2>
                </div>
                <div className="contents-card-grid">
                  {contentItems.map((item) => (
                    <button key={item.id} type="button" className="contents-feature-card" onClick={() => openContentDetail(item.id)}>
                      <div className="contents-feature-thumb" style={{ '--bg-img': `url('${item.image}')` }}></div>
                      <div className="contents-feature-copy">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </div>
                    </button>
                  ))}
                  {!contentItems.length ? <p className="board-empty">등록된 컨텐츠가 없습니다.</p> : null}
                </div>
              </div>
            ) : (
              <div className="guide-view-shell">
                <div className="guide-view-head">
                  <h2>{selectedContentItem?.title || '컨텐츠'}</h2>
                  <div className="public-board-toolbar">
                    <button type="button" className="btn" onClick={openContents}>{TEXT.back}</button>
                  </div>
                </div>
                <div className="guide-view-body">
                  <div className="guide-view-image-wrap">
                    <img
                      src={selectedContentItem?.image || ''}
                      alt={`${selectedContentItem?.title || '컨텐츠'} 안내`}
                      className="guide-view-image"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {!boardId && screen === 'auction' ? (
          <section className="section section-auction">
            <div className="auction-shell">
              <div className="auction-head">
                <div>
                  <div className="mypage-overline">거래소</div>
                  <h2>경매장</h2>
                </div>
                <div className="public-board-toolbar">
                  <button className="btn" type="button" onClick={goHome}>{TEXT.home}</button>
                </div>
              </div>

              <div className="auction-tabs">
                <button type="button" className={`auction-tab${auctionTab === 'list' ? ' active' : ''}`} disabled={auctionBusy} onClick={() => setAuctionTab('list')}>전체 경매</button>
                <button type="button" className={`auction-tab${auctionTab === 'my' ? ' active' : ''}`} disabled={auctionBusy} onClick={() => setAuctionTab('my')}>내 경매</button>
                <button type="button" className={`auction-tab${auctionTab === 'create' ? ' active' : ''}`} disabled={auctionBusy} onClick={() => setAuctionTab('create')}>경매 등록</button>
              </div>

              {auctionTab === 'list' ? (
                <div className="auction-panel">
                  <div className="auction-toolbar">
                    <div className="auction-search-wrap">
                      <input className="public-board-text-input" value={auctionSearchInput} onChange={(e) => setAuctionSearchInput(e.target.value)} placeholder="아이템명, 경매 번호, 판매자 검색" disabled={auctionBusy} />
                      <select className="public-board-select" value={auctionStatus} disabled={auctionBusy} onChange={(e) => { setAuctionStatus(e.target.value); setAuctionPage(1) }}>
                        <option value="">전체 상태</option>
                        <option value="active">진행 중</option>
                        <option value="expired">종료됨</option>
                      </select>
                      <button className="btn" type="button" disabled={auctionBusy} onClick={() => { setAuctionPage(1); setAuctionSearch(auctionSearchInput.trim()) }}>검색</button>
                    </div>
                  </div>
                  <div className="auction-table-wrap">
                    <table className="public-post-table auction-table">
                      <thead>
                        <tr>
                          <th>아이템</th>
                          <th>등급</th>
                          <th>수량</th>
                          <th>분류</th>
                          <th>시작가</th>
                          <th>현재가</th>
                          <th>즉구가</th>
                          <th>판매자</th>
                          <th>입찰자</th>
                          <th>남은 시간</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auctionLoading ? (
                          <tr><td colSpan={11} className="empty-cell">경매 목록을 불러오는 중입니다.</td></tr>
                        ) : auctionRows.length ? auctionRows.map((row) => {
                          const quality = auctionQualityMeta(row.item_quality)
                          const currentBid = Number(row.last_bid || 0) > 0 ? row.last_bid : row.start_bid
                          const isOwnAuction = Number(row.owner_account || 0) === Number(user?.accountID || user?.id || 0)
                          return (
                            <tr key={`auction-${row.id}`}>
                              <td data-label="아이템">
                                <div className="auction-item-cell">
                                  <span className="auction-item-icon">{auctionIconMap[row.item_entry] ? <img src={auctionIconMap[row.item_entry]} alt="" /> : '■'}</span>
                                  <span style={{ color: quality.color, fontWeight: 700 }}>{row.item_name || `아이템 ${row.item_entry}`}</span>
                                </div>
                              </td>
                              <td data-label="등급"><span style={{ color: quality.color, fontWeight: 700 }}>{quality.text}</span></td>
                              <td data-label="수량">{Number(row.item_count || 1)}</td>
                              <td data-label="분류">{auctionClassText(row.item_class, row.item_subclass)}</td>
                              <td data-label="시작가">{formatAuctionPrice(row.start_bid)}</td>
                              <td data-label="현재가">{formatAuctionPrice(currentBid)}</td>
                              <td data-label="즉구가">{formatAuctionPrice(row.buyout_price)}</td>
                              <td data-label="판매자">{row.owner_name || '-'}</td>
                              <td data-label="입찰자">{row.bidder_name || '-'}</td>
                              <td data-label="남은 시간">{formatAuctionRemain(row.end_unix)}</td>
                              <td data-label="관리">
                                {isOwnAuction ? (
                                  <span className="auction-self-note">본인 경매</span>
                                ) : (
                                  <div className="auction-action-group">
                                    <button className="btn btn-small" type="button" disabled={auctionBusy} onClick={() => { setAuctionAction({ type: 'buyout', row }); setAuctionActionBidGold(''); setAuctionActionBidSilver(''); setAuctionActionBidCopper('') }}>즉구</button>
                                    <button className="btn btn-small" type="button" disabled={auctionBusy} onClick={() => { setAuctionAction({ type: 'bid', row }); setAuctionActionBidGold(''); setAuctionActionBidSilver(''); setAuctionActionBidCopper('') }}>입찰</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={11} className="empty-cell">등록된 경매가 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="public-board-pager">
                    <button type="button" onClick={() => setAuctionPage((prev) => Math.max(1, prev - 1))} disabled={auctionPage <= 1}>이전</button>
                    <span>{auctionPage} / {auctionTotalPages}</span>
                    <button type="button" onClick={() => setAuctionPage((prev) => Math.min(auctionTotalPages, prev + 1))} disabled={auctionPage >= auctionTotalPages}>다음</button>
                  </div>
                </div>
              ) : null}

              {auctionTab === 'my' ? (
                <div className="auction-panel">
                  <div className="auction-table-wrap">
                    <table className="public-post-table auction-table">
                      <thead>
                        <tr>
                          <th>아이템</th>
                          <th>수량</th>
                          <th>현재가</th>
                          <th>즉구가</th>
                          <th>남은 시간</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auctionMyLoading ? (
                          <tr><td colSpan={6} className="empty-cell">내 경매 목록을 불러오는 중입니다.</td></tr>
                        ) : auctionMyRows.length ? auctionMyRows.map((row) => {
                          const quality = auctionQualityMeta(row.item_quality)
                          const currentBid = Number(row.last_bid || 0) > 0 ? row.last_bid : row.start_bid
                          return (
                            <tr key={`auction-my-${row.id}`}>
                              <td data-label="아이템">
                                <div className="auction-item-cell">
                                  <span className="auction-item-icon">{auctionIconMap[row.item_entry] ? <img src={auctionIconMap[row.item_entry]} alt="" /> : '■'}</span>
                                  <span style={{ color: quality.color, fontWeight: 700 }}>{row.item_name || `아이템 ${row.item_entry}`}</span>
                                </div>
                              </td>
                              <td data-label="수량">{Number(row.item_count || 1)}</td>
                              <td data-label="현재가">{formatAuctionPrice(currentBid)}</td>
                              <td data-label="즉구가">{formatAuctionPrice(row.buyout_price)}</td>
                              <td data-label="남은 시간">{formatAuctionRemain(row.end_unix)}</td>
                              <td data-label="관리">
                                <button className="btn btn-small btn-danger" type="button" disabled={auctionBusy} onClick={async () => {
                                  const confirmed = await showConfirm('해당 경매를 삭제하시겠습니까?')
                                  if (!confirmed) return
                                  await runAuctionTask('인게임 경매 상태를 확인하는 중입니다...', async () => {
                                    await apiFetch('/api/auction/cancel', { method: 'POST', body: JSON.stringify({ auction_id: Number(row.id) }) })
                                    await loadAuctionMyList(auctionMyPage)
                                    await loadAuctionList(auctionPage, auctionSearch, auctionStatus)
                                  })
                                }}>삭제</button>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={6} className="empty-cell">등록한 경매가 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="public-board-pager">
                    <button type="button" onClick={() => setAuctionMyPage((prev) => Math.max(1, prev - 1))} disabled={auctionMyPage <= 1}>이전</button>
                    <span>{auctionMyPage} / {auctionMyTotalPages}</span>
                    <button type="button" onClick={() => setAuctionMyPage((prev) => Math.min(auctionMyTotalPages, prev + 1))} disabled={auctionMyPage >= auctionMyTotalPages}>다음</button>
                  </div>
                </div>
              ) : null}

              {auctionTab === 'create' ? (
                <div className="auction-panel auction-create-panel">
                  <div className="auction-create-top">
                    <div className="auction-create-field">
                      <label>등록 캐릭터</label>
                      <select className="public-board-select" value={auctionCreateCharGuid} disabled={auctionBusy} onChange={(e) => { setAuctionCreateCharGuid(Number(e.target.value || 0)); setAuctionSelectedItemGuid(0) }}>
                        {auctionCharacters.length ? auctionCharacters.map((character) => (
                          <option key={character.guid} value={character.guid}>
                            {character.name} (Lv.{character.level}, {character.online ? '접속중' : '오프라인'})
                          </option>
                        )) : <option value="">캐릭터 없음</option>}
                      </select>
                    </div>
                    <div className="auction-create-summary">
                      <span>보유 골드</span>
                      <strong>{auctionSelectedCharacter ? formatAuctionPrice(auctionSelectedCharacter.money) : '-'}</strong>
                    </div>
                  </div>

                  <div className="auction-money-grid">
                    <div className="auction-money-box">
                      <span>시작가</span>
                      <div className="auction-money-inputs">
                        <input className="public-board-text-input" value={auctionStartBidGold} onChange={(e) => setAuctionStartBidGold(e.target.value)} placeholder="골드" disabled={auctionBusy} />
                        <input className="public-board-text-input" value={auctionStartBidSilver} onChange={(e) => setAuctionStartBidSilver(e.target.value)} placeholder="실버" disabled={auctionBusy} />
                        <input className="public-board-text-input" value={auctionStartBidCopper} onChange={(e) => setAuctionStartBidCopper(e.target.value)} placeholder="코퍼" disabled={auctionBusy} />
                      </div>
                    </div>
                    <div className="auction-money-box">
                      <span>즉구가</span>
                      <div className="auction-money-inputs">
                        <input className="public-board-text-input" value={auctionBuyoutGold} onChange={(e) => setAuctionBuyoutGold(e.target.value)} placeholder="골드" disabled={auctionBusy} />
                        <input className="public-board-text-input" value={auctionBuyoutSilver} onChange={(e) => setAuctionBuyoutSilver(e.target.value)} placeholder="실버" disabled={auctionBusy} />
                        <input className="public-board-text-input" value={auctionBuyoutCopper} onChange={(e) => setAuctionBuyoutCopper(e.target.value)} placeholder="코퍼" disabled={auctionBusy} />
                      </div>
                    </div>
                    <div className="auction-create-field">
                      <label>등록 시간</label>
                      <select className="public-board-select" value={auctionDurationHours} disabled={auctionBusy} onChange={(e) => setAuctionDurationHours(Number(e.target.value || 24))}>
                        <option value={12}>12시간</option>
                        <option value={24}>24시간</option>
                        <option value={48}>48시간</option>
                      </select>
                    </div>
                  </div>

                  <div className="auction-search-wrap">
                    <input className="public-board-text-input" value={auctionCreateSearch} onChange={(e) => setAuctionCreateSearch(e.target.value)} placeholder="등록할 아이템 검색" disabled={auctionBusy} />
                  </div>

                  <div className="auction-create-items">
                    {auctionCreateItemsLoading ? (
                      <div className="mypage-empty">등록 가능한 아이템을 불러오는 중입니다.</div>
                    ) : filteredAuctionCreateItems.length ? filteredAuctionCreateItems.map((item) => {
                      const quality = auctionQualityMeta(item.item_quality)
                      const active = Number(item.item_guid) === Number(auctionSelectedItemGuid)
                      return (
                        <button key={item.item_guid} type="button" className={`auction-create-item-card${active ? ' active' : ''}`} disabled={auctionBusy} onClick={() => setAuctionSelectedItemGuid(Number(item.item_guid))}>
                          <span className="auction-item-icon large">{auctionIconMap[item.item_entry] ? <img src={auctionIconMap[item.item_entry]} alt="" /> : '■'}</span>
                          <div className="auction-create-item-copy">
                            <strong style={{ color: quality.color }}>{item.item_name || `아이템 ${item.item_entry}`}</strong>
                            <span>{auctionClassText(item.item_class, item.item_subclass)}</span>
                          </div>
                          <span className="auction-create-item-count">x{Number(item.item_count || 1)}</span>
                        </button>
                      )
                    }) : (
                      <div className="mypage-empty">등록 가능한 아이템이 없습니다.</div>
                    )}
                  </div>

                  <div className="public-post-write-actions">
                    <button
                      className="btn"
                      type="button"
                      disabled={auctionBusy}
                      onClick={async () => {
                        const toCopper = (g, s, c) => (Math.max(0, Number(g || 0)) * 10000) + (Math.max(0, Number(s || 0)) * 100) + Math.max(0, Number(c || 0))
                        const startBid = toCopper(auctionStartBidGold, auctionStartBidSilver, auctionStartBidCopper)
                        const buyoutPrice = toCopper(auctionBuyoutGold, auctionBuyoutSilver, auctionBuyoutCopper)
                        if (!auctionCreateCharGuid || !auctionSelectedItemGuid || !startBid || !buyoutPrice) {
                          await showAlert('캐릭터, 아이템, 시작가, 즉구가를 모두 입력해 주세요.')
                          return
                        }
                        const ok = await runAuctionTask('인게임 아이템과 경매 상태를 확인하는 중입니다...', async () => {
                          await apiFetch('/api/auction/create', {
                            method: 'POST',
                            body: JSON.stringify({
                              char_guid: Number(auctionCreateCharGuid),
                              item_guid: Number(auctionSelectedItemGuid),
                              start_bid: startBid,
                              buyout_price: buyoutPrice,
                              duration_hours: Number(auctionDurationHours || 24),
                            }),
                          })
                          setAuctionSelectedItemGuid(0)
                          setAuctionStartBidGold('')
                          setAuctionStartBidSilver('')
                          setAuctionStartBidCopper('')
                          setAuctionBuyoutGold('')
                          setAuctionBuyoutSilver('')
                          setAuctionBuyoutCopper('')
                          await loadAuctionCreateItems(auctionCreateCharGuid)
                          await loadAuctionMyList(1)
                          await loadAuctionList(1, auctionSearch, auctionStatus)
                        })
                        if (!ok) return
                        await showAlert('경매가 등록되었습니다.')
                        setAuctionTab('my')
                      }}
                    >
                      경매 등록
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {auctionAction?.row && Number(auctionAction.row.owner_account || 0) !== Number(user?.accountID || user?.id || 0) ? (
              <div className="auction-modal-backdrop" onClick={() => { if (!auctionBusy) setAuctionAction(null) }}>
                <div className="auction-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="guide-view-head auction-modal-head">
                    <h2>{auctionAction.type === 'bid' ? '입찰하기' : '즉시구매'}</h2>
                    <div className="public-board-toolbar">
                      <button type="button" className="btn" disabled={auctionBusy} onClick={() => setAuctionAction(null)}>닫기</button>
                    </div>
                  </div>
                  <div className="auction-modal-body">
                    <div className="auction-item-cell large">
                      <span className="auction-item-icon large">{auctionIconMap[auctionAction.row.item_entry] ? <img src={auctionIconMap[auctionAction.row.item_entry]} alt="" /> : '■'}</span>
                      <div className="auction-modal-item-copy">
                        <strong style={{ color: auctionQualityMeta(auctionAction.row.item_quality).color }}>{auctionAction.row.item_name || `아이템 ${auctionAction.row.item_entry}`}</strong>
                        <span>{auctionClassText(auctionAction.row.item_class, auctionAction.row.item_subclass)}</span>
                      </div>
                    </div>
                    <div className="auction-create-field">
                      <label>거래 캐릭터</label>
                      <select className="public-board-select" value={auctionActionCharGuid} disabled={auctionBusy} onChange={(e) => setAuctionActionCharGuid(Number(e.target.value || 0))}>
                        <option value="">캐릭터를 선택하세요</option>
                        {auctionCharacters.map((character) => (
                          <option key={`auction-action-${character.guid}`} value={character.guid}>
                            {character.name} (Lv.{character.level}, {character.online ? '접속중' : '오프라인'})
                          </option>
                        ))}
                      </select>
                    </div>
                    {auctionAction.type === 'bid' ? (
                      <div className="auction-money-box">
                        <span>입찰 금액</span>
                        <div className="auction-money-inputs">
                          <input className="public-board-text-input" value={auctionActionBidGold} onChange={(e) => setAuctionActionBidGold(e.target.value)} placeholder="골드" disabled={auctionBusy} />
                          <input className="public-board-text-input" value={auctionActionBidSilver} onChange={(e) => setAuctionActionBidSilver(e.target.value)} placeholder="실버" disabled={auctionBusy} />
                          <input className="public-board-text-input" value={auctionActionBidCopper} onChange={(e) => setAuctionActionBidCopper(e.target.value)} placeholder="코퍼" disabled={auctionBusy} />
                        </div>
                        <small>최소 입찰가: {formatAuctionPrice(Number(auctionAction.row.last_bid || 0) > 0 ? Number(auctionAction.row.last_bid) + 1 : auctionAction.row.start_bid)}</small>
                      </div>
                    ) : (
                      <div className="auction-summary-line"><span>즉구가</span><strong>{formatAuctionPrice(auctionAction.row.buyout_price)}</strong></div>
                    )}
                    <div className="public-post-write-actions">
                      <button
                        className="btn"
                        type="button"
                        disabled={auctionBusy}
                        onClick={async () => {
                          if (!auctionActionCharGuid) {
                            await showAlert('캐릭터를 선택해 주세요.')
                            return
                          }
                          const ok = await runAuctionTask(
                            auctionAction.type === 'bid' ? '인게임 골드와 입찰 상태를 확인하는 중입니다...' : '인게임 골드와 구매 상태를 확인하는 중입니다...',
                            async () => {
                              if (auctionAction.type === 'bid') {
                                const bidPrice = (Math.max(0, Number(auctionActionBidGold || 0)) * 10000) + (Math.max(0, Number(auctionActionBidSilver || 0)) * 100) + Math.max(0, Number(auctionActionBidCopper || 0))
                                if (!bidPrice) {
                                  throw new Error('입찰 금액을 입력해 주세요.')
                                }
                                await apiFetch('/api/auction/bid', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    auction_id: Number(auctionAction.row.id),
                                    buyer_char_guid: Number(auctionActionCharGuid),
                                    bid_price: bidPrice,
                                  }),
                                })
                              } else {
                                await apiFetch('/api/auction/buyout', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    auction_id: Number(auctionAction.row.id),
                                    buyer_char_guid: Number(auctionActionCharGuid),
                                  }),
                                })
                              }
                              setAuctionAction(null)
                              setAuctionActionCharGuid(0)
                              setAuctionActionBidGold('')
                              setAuctionActionBidSilver('')
                              setAuctionActionBidCopper('')
                              await loadAuctionList(auctionPage, auctionSearch, auctionStatus)
                              await loadAuctionMyList(auctionMyPage)
                            },
                          )
                          if (!ok) return
                          await showAlert(auctionAction.type === 'bid' ? '입찰이 완료되었습니다.' : '구매가 완료되었습니다.')
                        }}
                      >
                        {auctionAction.type === 'bid' ? '입찰 확정' : '즉시구매'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {auctionBusy ? (
              <div className="auction-progress-overlay" role="status" aria-live="polite" aria-busy="true">
                <div className="auction-progress-card">
                  <div className="auction-progress-spinner" />
                  <strong>경매 처리 대기중</strong>
                  <p>{auctionBusyMessage || '인게임 경매 데이터를 확인하는 중입니다...'}</p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!boardId && screen === 'mypage' && user ? (
          <section className="section">
            <div className="mypage-shell">
              <div className="mypage-head">
                <div>
                  <div className="mypage-overline">내 정보</div>
                  <h2>마이페이지</h2>
                </div>
                <div className="public-board-toolbar">
                  <button className="btn" type="button" onClick={goHome}>{TEXT.home}</button>
                </div>
              </div>

              <div className="mypage-grid">
                <section className="mypage-card mypage-profile-card">
                  <div className="mypage-profile-main">
                    <div className="mypage-avatar-frame">
                      <img src={getRaceIcon(myPageMainCharacter?.race, myPageMainCharacter?.gender)} alt={`${welcomeName} 대표 캐릭터`} />
                    </div>
                    <div className="mypage-profile-copy">
                      <div className="mypage-name-row">
                        <strong>{user.username || welcomeName}</strong>
                        {isAdmin(user) ? <span className="mypage-badge">관리자</span> : null}
                      </div>
                      <p>{user.email || '등록된 이메일이 없습니다.'}</p>
                      <div className="mypage-point-box">
                        <span>웹 포인트</span>
                        <strong>{Number(user.points || 0).toLocaleString()} P</strong>
                      </div>
                    </div>
                  </div>
                  <div className="mypage-profile-summary">
                    <div className="mypage-summary-item">
                      <span>대표 캐릭터</span>
                      <strong>{myPageMainCharacter?.name || user.username || '미설정'}</strong>
                    </div>
                    <div className="mypage-summary-item">
                      <span>종족 / 직업</span>
                      <strong>{myPageMainCharacter ? `${getRaceName(myPageMainCharacter.race)} / ${getClassName(myPageMainCharacter.class)}` : '-'}</strong>
                    </div>
                    <div className="mypage-summary-item">
                      <span>레벨</span>
                      <strong>{myPageMainCharacter ? `Lv.${myPageMainCharacter.level}` : '-'}</strong>
                    </div>
                  </div>
                </section>

                <section className="mypage-card mypage-character-section">
                  <div className="mypage-section-head">
                    <h3>대표 캐릭터 설정</h3>
                    <span className="public-board-status">{myPageCharactersLoading ? '불러오는 중...' : `${myPageCharacters.length}명`}</span>
                  </div>
                  {myPageCharactersLoading ? <div className="mypage-empty">캐릭터 목록을 불러오는 중입니다.</div> : null}
                  {!myPageCharactersLoading && !myPageCharacters.length ? <div className="mypage-empty">등록된 캐릭터가 없습니다.</div> : null}
                  {!myPageCharactersLoading && myPageCharacters.length ? (
                    <div className="mypage-character-grid">
                      {myPageCharacters.map((character) => {
                        const active = Number(character.guid) === Number(myPageMainCharacter?.guid || 0)
                        return (
                          <button key={character.guid} type="button" className={`mypage-character-card${active ? ' active' : ''}`} onClick={() => handleSetMainCharacter(character)}>
                            <div className="mypage-character-top">
                              <img src={getRaceIcon(character.race, character.gender)} alt={`${character.name} 종족`} className="mypage-character-avatar" />
                              <div className="mypage-character-copy">
                                <strong>{character.name}</strong>
                                <span>Lv.{character.level} {getRaceName(character.race)} / {getClassName(character.class)}</span>
                              </div>
                            </div>
                            <div className="mypage-character-meta">
                              <span>{getZoneName(character.map)}</span>
                              <span>{active ? '대표 캐릭터' : '대표로 설정'}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </section>

                <section className="mypage-card mypage-points-card">
                  <div className="mypage-section-head">
                    <h3>포인트 이용 내역</h3>
                    <span className="public-board-status">
                      {myPagePointLoading ? '불러오는 중...' : `페이지 ${myPagePointPage} / ${myPagePointTotalPages}`}
                    </span>
                  </div>
                  <div className="mypage-point-table-wrap">
                    <table className="mypage-point-table">
                      <thead>
                        <tr><th>변동</th><th>사유</th><th>시간</th></tr>
                      </thead>
                      <tbody>
                        {myPagePointLogs.length ? (
                          <>
                            {myPagePointLogs.map((log, index) => (
                              <tr key={`${log.createdAt || 'point'}-${index}`}>
                                <td className={Number(log.amount || 0) >= 0 ? 'mypage-point-plus' : 'mypage-point-minus'}>
                                  {Number(log.amount || 0) >= 0 ? '+' : ''}{Number(log.amount || 0).toLocaleString()}
                                </td>
                                <td>{log.reason || '-'}</td>
                                <td>{formatDate(log.createdAt)}</td>
                              </tr>
                            ))}
                            {Array.from({ length: myPagePointFillCount }).map((_, index) => (
                              <tr key={`point-fill-${index}`} className="mypage-point-filler-row" aria-hidden="true">
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                              </tr>
                            ))}
                          </>
                        ) : myPagePointLoading ? (
                          <tr><td colSpan={3} className="empty-cell">포인트 내역을 불러오는 중입니다.</td></tr>
                        ) : (
                          <>
                            <tr><td colSpan={3} className="empty-cell">포인트 이용 내역이 없습니다.</td></tr>
                            {Array.from({ length: 19 }).map((_, index) => (
                              <tr key={`point-empty-fill-${index}`} className="mypage-point-filler-row" aria-hidden="true">
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {myPagePointTotalPages > 1 ? (
                    <div className="public-board-pager">
                      <button type="button" disabled={myPagePointLoading || myPagePointPage <= 1} onClick={() => setMyPagePointPage((prev) => Math.max(1, prev - 1))}>{TEXT.previous}</button>
                      <button type="button" disabled>{myPagePointPage} / {myPagePointTotalPages}</button>
                      <button type="button" disabled={myPagePointLoading || myPagePointPage >= myPagePointTotalPages} onClick={() => setMyPagePointPage((prev) => Math.min(myPagePointTotalPages, prev + 1))}>{TEXT.next}</button>
                    </div>
                  ) : null}
                </section>
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'notifications' && user ? (
          <section className="section">
            <div className="notification-shell">
              <div className="notification-head">
                <div>
                  <div className="mypage-overline">메시지</div>
                  <h2>알림함</h2>
                </div>
                <div className="public-board-toolbar">
                  <button className="btn" type="button" onClick={goHome}>{TEXT.home}</button>
                </div>
              </div>

              <div className="notification-summary-grid">
                <div className="notification-summary-card">
                  <span>읽지 않은 알림</span>
                  <strong>{notificationUnreadCount.toLocaleString()}개</strong>
                </div>
                <div className="notification-summary-card">
                  <span>전체 페이지</span>
                  <strong>{notificationTotalPages.toLocaleString()} 페이지</strong>
                </div>
                <div className="notification-summary-card actions">
                  <button className="btn" type="button" onClick={() => { void markAllNotificationsRead(); void loadNotificationCenter(notificationPage, notificationSearch) }}>모두 읽음</button>
                </div>
              </div>

              <div className="notification-panel">
                <div className="notification-category-tabs">
                  {NOTIFICATION_CATEGORIES.map((category) => (
                    <button
                      key={`notification-category-${category.value || 'all'}`}
                      type="button"
                      className={`notification-category-tab${notificationCategory === category.value ? ' active' : ''}`}
                      onClick={() => {
                        setNotificationPage(1)
                        setNotificationCategory(category.value)
                      }}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="auction-toolbar">
                  <div className="auction-search-wrap">
                    <input
                      className="public-board-text-input"
                      value={notificationSearchInput}
                      onChange={(e) => setNotificationSearchInput(e.target.value)}
                      placeholder="제목, 내용, 보낸이 검색"
                    />
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setNotificationPage(1)
                        setNotificationSearch(notificationSearchInput.trim())
                      }}
                    >
                      검색
                    </button>
                  </div>
                </div>

                <div className="notification-table-wrap">
                  <table className="public-post-table notification-table">
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>분류</th>
                        <th>제목</th>
                        <th>내용</th>
                        <th>보낸이</th>
                        <th>수신일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationCenterLoading ? (
                        <tr><td colSpan={6} className="empty-cell">알림 목록을 불러오는 중입니다.</td></tr>
                      ) : notifications.length ? notifications.map((notification) => {
                        const meta = notificationTypeMeta(notification.type)
                        return (
                          <tr
                            key={`notification-center-${notification.id}`}
                            className={`notification-table-row${notification.is_read ? '' : ' unread'}`}
                            onClick={() => { void openNotificationTarget(notification) }}
                          >
                            <td data-label="상태">
                              <span className={`notification-status-pill${notification.is_read ? '' : ' unread'}`}>{notification.is_read ? '읽음' : '새 알림'}</span>
                            </td>
                            <td data-label="분류">
                              <span className={`notification-kind-pill ${meta.className}`}>{notificationTypeLabel(notification.type)}</span>
                            </td>
                            <td data-label="제목" className="notification-title-cell">{notification.title || '알림'}</td>
                            <td data-label="내용" className="notification-message-cell">{notification.message || '-'}</td>
                            <td data-label="보낸이">{notification.sender_name || '시스템'}</td>
                            <td data-label="수신일">{formatDate(notification.created_at)}</td>
                          </tr>
                        )
                      }) : (
                        <tr><td colSpan={6} className="empty-cell">표시할 알림이 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="public-board-pager">
                  <button type="button" onClick={() => setNotificationPage((prev) => Math.max(1, prev - 1))} disabled={notificationPage <= 1}>이전</button>
                  <span>{notificationPage} / {notificationTotalPages}</span>
                  <button type="button" onClick={() => setNotificationPage((prev) => Math.min(notificationTotalPages, prev + 1))} disabled={notificationPage >= notificationTotalPages}>다음</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {boardId && currentBoard && (
          <section id="public-board-view" className="section">
            <div className="public-board-layout">
              <aside className="public-board-sidebar">
                <div className="public-board-head public-board-head-side"><h3>{TEXT.board}</h3><span className="public-board-status">총 {visibleBoards.length}개</span></div>
                <div className="public-board-list">
                  {visibleBoards.map((board) => (
                    <button key={board.id} type="button" className={`public-board-btn${board.id === boardId ? ' active' : ''}`} onClick={() => openBoard(board.id)}>{board.name}</button>
                  ))}
                </div>
              </aside>

              <section className="public-board-panel">
                {screen === 'list' && (
                  <>
                    <div className="public-board-head">
                      <h2>{currentBoard.name}</h2>
                      <div className="public-board-toolbar">
                        <button className="btn" type="button" onClick={goHome}>{TEXT.home}</button>
                        {canWrite(currentBoard, user) ? <button className="btn" type="button" onClick={openWrite}>{TEXT.write}</button> : null}
                      </div>
                    </div>

                    <div className="public-board-search-wrap">
                      <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="검색어를 입력해 주세요." />
                      <button className="btn" type="button" onClick={() => { setPage(1); setSearch(searchInput.trim()) }}>{TEXT.search}</button>
                    </div>

                    <div className="public-post-table-wrap">
                      <table className="public-post-table">
                        <thead>
                          <tr><th>{TEXT.number}</th><th>{TEXT.titleCol}</th><th>{TEXT.author}</th><th>{TEXT.time}</th></tr>
                        </thead>
                        <tbody>
                          {loadingPosts ? (
                            <tr><td className="empty-cell" colSpan={4}>{TEXT.loadingPosts}</td></tr>
                          ) : posts.length ? (
                            posts.map((post) => (
                              <tr key={post.id} onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}&post=${post.id}`)}>
                                <td data-label={TEXT.number}>{post.display_number || post.id}</td>
                                <td data-label={TEXT.titleCol}>
                                  <span className="public-post-title">{post.title}</span>
                                  {isBugReportBoard ? (
                                    <span className="support-list-meta">
                                      {post.category ? <span className="support-category-pill">{post.category}</span> : null}
                                      {renderSupportStatus(post.inquiry_status)}
                                    </span>
                                  ) : Number(post.comment_count || 0) > 0 ? <span className="public-comment-count">[{post.comment_count}]</span> : null}
                                </td>
                                <td data-label={TEXT.author}>{renderAuthor(post.author_name, post.is_staff_author, post.has_enhanced_stone)}</td>
                                <td data-label={TEXT.time}>{formatDate(post.created_at)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr><td className="empty-cell" colSpan={4}>{TEXT.noPosts}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 ? (
                      <div className="public-board-pager">
                        <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>{TEXT.previous}</button>
                        <button type="button" disabled>{page} / {totalPages}</button>
                        <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>{TEXT.next}</button>
                      </div>
                    ) : null}
                  </>
                )}
                {screen === 'detail' && detail?.post ? (
                  <>
                    <div className="public-board-head"><h2>{detail.post.title}</h2><div className="public-board-toolbar"><button className="btn" type="button" onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)}>{TEXT.back}</button></div></div>
                    <div className="public-comment-meta public-detail-meta"><span>{renderAuthor(detail.post.author_name, detail.post.is_staff_author, detail.post.has_enhanced_stone)}</span><span>조회 {Number(detail.post.views || 0).toLocaleString()}</span><span>{formatDate(detail.post.created_at)}</span></div>
                    {detail.post.category ? <div className="public-detail-chip">분류: {detail.post.category}</div> : null}
                    <article className="public-post-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.post.content || '') }} />
                    {isPromotionBoard && asArray(detail.post.promotion_urls).length ? (
                      <div className="public-promotion-links"><h3>등록된 홍보 URL</h3><ul>{detail.post.promotion_urls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></div>
                    ) : null}
                    {canEditOwner(detail.post, user) ? (
                      <div className="public-post-write-actions">
                        <button className="btn" type="button" onClick={beginEdit}>수정하기</button>
                        <button className="btn btn-danger" type="button" onClick={deletePost}>삭제하기</button>
                      </div>
                    ) : null}

                    {isBugReportBoard ? (
                      <section className="public-bug-replies">
                        <div className="public-bug-replies-head">
                          <div>
                            <span className="public-bug-replies-kicker">관리자 답변</span>
                            <h3>버그 리포트 처리 내역</h3>
                          </div>
                          {renderSupportStatus(detail.post.inquiry_status)}
                        </div>
                        <div className="public-bug-replies-note">
                          답변은 관리자 확인 후 이곳에 등록됩니다. 추가 내용이 필요하면 기존 리포트를 수정해 주세요.
                        </div>
                        {!comments.length ? (
                          <div className="public-bug-empty">아직 등록된 관리자 답변이 없습니다.</div>
                        ) : (
                          <div className="public-bug-thread">
                            {comments.map((comment, index) => (
                              <div id={`comment-${comment.id}`} key={comment.id} className={`public-bug-reply ${String(comment.role || '').toLowerCase() === 'staff' ? 'staff' : 'user'} ${index > 0 ? 'is-followup' : ''}`}>
                                {index > 0 ? <span className="public-bug-reply-arrow" aria-hidden="true">↳</span> : null}
                                <div className="public-bug-reply-head">
                                  <strong>{index > 0 ? '답글의 답글' : (String(comment.role || '').toLowerCase() === 'staff' ? '관리자 답변' : '리포트 작성자')}</strong>
                                  <span>{formatDate(comment.created_at)}</span>
                                </div>
                                <div className="public-bug-reply-author">{renderAuthor(comment.author_name, comment.is_staff_author, comment.has_enhanced_stone)}</div>
                                {String(comment.role || '').toLowerCase() === 'staff' ? (
                                  <div className="public-bug-reply-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.content || '') }} />
                                ) : (
                                  <div className="public-bug-reply-body">{comment.content}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {String(detail.post.inquiry_status || '').toLowerCase() !== 'done' ? (
                          user ? (
                            canUserReplyBugReport ? (
                              <div className="public-bug-user-reply">
                                <label>추가 답글 작성</label>
                                <textarea className="public-board-textarea" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="관리자에게 추가로 전달할 내용을 입력해 주세요." />
                                <div className="public-post-write-actions">
                                  <button className="btn public-comment-submit" type="button" onClick={submitComment}>답글 등록</button>
                                </div>
                              </div>
                            ) : (
                              <div className="public-bug-waiting">관리자 답글이 등록되면 추가 답글을 작성할 수 있습니다.</div>
                            )
                          ) : (
                            <div className="public-bug-empty">로그인 후 추가 답글을 등록할 수 있습니다.</div>
                          )
                        ) : (
                          <div className="public-bug-closed">완료된 리포트입니다. 추가 답글은 등록할 수 없습니다.</div>
                        )}
                      </section>
                    ) : (
                      <section className="public-comments">
                        <div className="public-comment-head"><h3>{isInquiryBoard ? '문의 진행 내용' : '댓글'}</h3><span className="public-board-status">{comments.length}개</span></div>
                        {!comments.length ? <div className="public-comment">{TEXT.commentsEmpty}</div> : null}
                        {comments.map((comment) => (
                          <div id={`comment-${comment.id}`} key={comment.id} className={`public-comment public-comment-depth-${Math.min(Number(comment.depth || 0), 3)}`}>
                            <div className="public-comment-head">
                              <strong>{renderAuthor(comment.author_name, comment.is_staff_author, comment.has_enhanced_stone)}</strong>
                              <div className="public-comment-actions">
                                {!isInquiryBoard && user ? <button className="btn btn-small" type="button" onClick={() => setReplyTarget({ id: comment.id, authorName: comment.author_name })}>답글</button> : null}
                                {canEditOwner(comment, user) && !isInquiryBoard ? <button className="btn btn-small btn-danger" type="button" onClick={() => deleteComment(comment.id)}>삭제</button> : null}
                              </div>
                            </div>
                            <div className="public-comment-meta">{comment.role ? <span>{comment.role === 'staff' ? '운영 답변' : '문의자'}</span> : null}<span>{formatDate(comment.created_at)}</span></div>
                            <div className="public-comment-body">{comment.content}</div>
                          </div>
                        ))}

                        {!isInquiryBoard ? (
                        user ? (
                          <div className="public-post-write-actions public-comment-write-box">
                            {replyTarget ? (
                              <div className="public-reply-target">
                                <span><strong>{replyTarget.authorName}</strong> 님에게 답글 작성 중</span>
                                <button type="button" className="button-reset" onClick={() => setReplyTarget(null)}>취소</button>
                              </div>
                            ) : null}
                            <textarea className="public-board-textarea" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder={TEXT.commentPlaceholder} />
                            <button className="btn public-comment-submit" type="button" onClick={submitComment}>댓글 저장</button>
                          </div>
                        ) : (
                          <div className="public-comment">{TEXT.commentsNeedLogin}</div>
                        )
                        ) : null}
                      </section>
                    )}
                  </>
                ) : null}

                {screen === 'write' ? (
                  <>
                    <div className="public-board-head"><h2>{currentBoard.name} 글 작성</h2><div className="public-board-toolbar"><button className="btn" type="button" onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)}>{TEXT.back}</button></div></div>
                    <div className="public-post-write-card">
                      <input className="public-board-text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TEXT.titlePlaceholder} />
                      {isSupportBoard ? <><InquiryFields mode={isBugReportBoard ? 'bugreport' : 'inquiry'} category={inquiryCategory} onCategoryChange={setInquiryCategory} sponsorAgree={sponsorAgree} onSponsorAgreeChange={setSponsorAgree} sponsorName={sponsorName} onSponsorNameChange={setSponsorName} sponsorAmount={sponsorAmount} onSponsorAmountChange={setSponsorAmount} /><QuillEditor value={content} onChange={setContent} onAlert={showAlert} /></> : null}
                      {isPromotionBoard ? <PromotionFields urls={promotionUrls} onChange={updatePromotionUrl} onAdd={addPromotionUrl} onRemove={removePromotionUrl} /> : null}
                      {!isSupportBoard && !isPromotionBoard ? <QuillEditor value={content} onChange={setContent} onAlert={showAlert} /> : null}
                      <div className="public-post-write-actions"><button className="btn" type="button" onClick={savePost}>{TEXT.save}</button></div>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logo-text">The Karazhan</div>
            <p>카라잔 월드에 필요한 안내와 커뮤니티 정보를 한 곳에서 제공합니다.</p>
          </div>
          <div>
            <h3>게임 정보</h3>
            <a href="#">게임 소개</a>
            <a href="#connect-section">접속 방법</a>
            <button type="button" className="button-reset footer-link-button" onClick={openServerRules}>
              서버 규칙
            </button>
            <a href="#">시스템 안내</a>
            <a href="/shop/">선술집</a>
          </div>
          <div>
            <h3>고객지원</h3>
            <a href="#">1:1 문의</a>
            <a href="#">FAQ</a>
            <a href="#">내 계정</a>
            <button type="button" className="button-reset footer-link-button" onClick={() => openBoard(visibleBoards[0]?.id)}>
              공지 모음
            </button>
          </div>
          <div>
            <h3>커뮤니티</h3>
            <button
              type="button"
              className="button-reset footer-link-button"
              onClick={() => openBoard(visibleBoards.find((board) => board.name.includes('자유'))?.id || visibleBoards[0]?.id)}
            >
              자유게시판
            </button>
            <a href="#">SNS 채널</a>
            <a href="#">디스코드</a>
          </div>
        </div>
      </footer>
      {dialogState.open ? (
        <div className="app-dialog-backdrop" onClick={() => { if (dialogState.mode === 'alert') closeDialog(true) }}>
          <div className="app-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="app-dialog-head">
              <strong>{dialogState.title || '안내'}</strong>
            </div>
            <div className="app-dialog-body">
              <p>{dialogState.message}</p>
            </div>
            <div className="app-dialog-actions">
              {dialogState.mode === 'confirm' ? (
                <>
                  <button type="button" className="btn app-dialog-cancel" onClick={() => closeDialog(false)}>취소</button>
                  <button type="button" className="btn" onClick={() => closeDialog(true)}>확인</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => closeDialog(true)}>확인</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App

