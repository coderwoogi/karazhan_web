
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
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
const GRAND_OPEN_AT = new Date('2026-06-19T00:00:00+09:00').getTime()
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

// ---- 임의 HTML / claude.ai standalone 아티팩트 가져오기 ----
// gzip 해제 (번들 자산 디코딩용). DecompressionStream 미지원 환경에서는 원본 바이트 반환.
async function gunzipBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') return bytes
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const reader = ds.readable.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

// 번들 자산(base64, gzip 가능) → data URI. 인라인 가능한 자산(이미지 등)에만 사용.
async function bundleAssetToDataUri(entry) {
  const binary = atob(entry.data || '')
  let bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  if (entry.compressed) bytes = await gunzipBytes(bytes)
  let b64 = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return `data:${entry.mime || 'application/octet-stream'};base64,${btoa(b64)}`
}

// claude.ai "standalone" 번들 HTML을 일반 HTML로 해제. 번들이 아니면 '' 반환.
// 이미지 자산은 data URI로 인라인하고, 폰트·스크립트 참조는 제거한다.
async function unbundleArtifactHtml(text) {
  const tpl = text.match(/<script type="__bundler\/template">\s*([\s\S]*?)<\/script>/)
  if (!tpl) return ''
  let template
  try { template = JSON.parse(tpl[1]) } catch (e) { return '' }
  const man = text.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)<\/script>/)
  if (man) {
    let manifest = {}
    try { manifest = JSON.parse(man[1]) } catch (e) { manifest = {} }
    for (const uuid of Object.keys(manifest)) {
      const entry = manifest[uuid]
      const mime = String((entry && entry.mime) || '')
      if (mime.startsWith('image/')) {
        try {
          const dataUri = await bundleAssetToDataUri(entry)
          template = template.split(uuid).join(dataUri)
        } catch (e) { template = template.split(uuid).join('') }
      } else {
        template = template.split(uuid).join('')
      }
    }
  }
  const doc = new DOMParser().parseFromString(template, 'text/html')
  const host = doc.querySelector('x-dc') || doc.body || doc.documentElement
  host.querySelectorAll('script, link, meta, title, noscript, helmet').forEach((node) => node.remove())
  return (host.innerHTML || '').trim()
}

// 가져온 파일 텍스트에서 게시글 본문에 넣을 HTML 추출.
// claude.ai 번들이면 해제하고, 일반 HTML이면 <head>의 style + <body> 내용을 사용한다.
async function extractImportableHtml(raw) {
  const text = String(raw || '')
  if (text.includes('__bundler/template')) {
    const out = await unbundleArtifactHtml(text)
    if (out) return out
  }
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const headStyles = Array.from(doc.head ? doc.head.querySelectorAll('style') : []).map((node) => node.outerHTML).join('')
  const body = doc.body || doc.documentElement
  body.querySelectorAll('script, link, meta, title, noscript').forEach((node) => node.remove())
  return `${headStyles}${(body.innerHTML || '').trim()}`.trim()
}

// 업데이트 게시판 작성 양식(템플릿). 새 업데이트 글 작성 시 에디터에 미리 채워진다.
const UPDATE_TEMPLATE = '<p>이번 업데이트 요약을 한 줄로 적어주세요.</p><h3>신규</h3><ul><li>추가된 콘텐츠를 입력하세요</li></ul><h3>개선</h3><ul><li>개선 사항을 입력하세요</li></ul><h3>수정</h3><ul><li>수정·버그 픽스 내용을 입력하세요</li></ul>'

const UPDATE_CATEGORY_RULES = [
  { type: 'new', kw: ['신규', '추가', 'new'] },
  { type: 'improve', kw: ['개선', '향상', 'improve'] },
  { type: 'fix', kw: ['수정', '버그', '픽스', 'fix', 'hotfix'] },
]

// 업데이트 상세: 신규/개선/수정 제목을 분류 색상 칩으로 자동 꾸밈 (class 부여)
function decorateUpdateContent(content) {
  const template = document.createElement('template')
  template.innerHTML = String(content || '')
  template.content.querySelectorAll('h1, h2, h3, h4').forEach((node) => {
    const text = (node.textContent || '').replace(/\s/g, '').toLowerCase()
    if (!text) return
    const rule = UPDATE_CATEGORY_RULES.find((r) => r.kw.some((k) => text.includes(k.toLowerCase())))
    if (rule) node.classList.add('update-cat', `update-cat-${rule.type}`)
  })
  return template.innerHTML
}

function extractFirstImageUrl(content) {
  const template = document.createElement('template')
  template.innerHTML = String(content || '')
  const image = template.content.querySelector('img')
  return image?.getAttribute('src') || ''
}

function extractPostThumbnail(post) {
  const direct = String(post?.thumbnail || post?.preview_image || '').trim()
  if (direct) return direct
  return extractFirstImageUrl(post?.content || '')
}

function stripHtmlText(content) {
  const template = document.createElement('template')
  template.innerHTML = String(content || '')
  template.content.querySelectorAll('script, style').forEach((node) => node.remove())
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim()
}

function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : ''
}

function formatShortDate(value) {
  const normalized = formatDate(value)
  if (!normalized) return '-'
  return normalized.slice(5, 10).replace('-', '.')
}

function renderVersionBadge(version) {
  const cleanVersion = String(version || '').trim()
  if (!cleanVersion) return null
  return <span className="public-version-badge">v{cleanVersion}</span>
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

function padCountdown(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0')
}

function formatUptime(sec) {
  const s = Math.max(0, Number(sec) || 0)
  if (s <= 0) return '-'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}일 ${h}시간`
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

const GRAND_OPEN_WINDOW = 30 * 86400000

function getGrandOpenCountdown(now = Date.now()) {
  const diff = GRAND_OPEN_AT - now
  const absolute = Math.abs(diff)
  const days = Math.floor(absolute / 86400000)
  const hours = Math.floor((absolute % 86400000) / 3600000)
  const minutes = Math.floor((absolute % 3600000) / 60000)
  const seconds = Math.floor((absolute % 60000) / 1000)
  const timeLabel = `${padCountdown(hours)}:${padCountdown(minutes)}:${padCountdown(seconds)}`
  const progress = Math.min(1, Math.max(0, (now - (GRAND_OPEN_AT - GRAND_OPEN_WINDOW)) / GRAND_OPEN_WINDOW))

  if (diff <= 0) {
    return {
      dayLabel: days > 0 ? `D+${days}` : 'D-DAY',
      timeLabel,
      caption: '카라잔 정식 오픈이 시작되었습니다.',
      progress: 1,
    }
  }

  return {
    dayLabel: days > 0 ? `D-${days}` : 'D-DAY',
    timeLabel,
    caption: '카라잔 정식 오픈까지 남은 시간',
    progress,
  }
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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
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

async function uploadEditorImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const result = await apiFetch('/api/board/upload', {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json' },
  })
  return result?.url || result?.path || ''
}

function RteButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function RteDivider() {
  return <span className="rte-divider" aria-hidden="true" />
}

function RichEditor({ value, onChange, onAlert, allowHtml = false }) {
  const editorRef = useRef(null)
  const onAlertRef = useRef(onAlert)
  const [htmlMode, setHtmlMode] = useState(false)
  useEffect(() => { onAlertRef.current = onAlert }, [onAlert])

  const insertImageFiles = useCallback((files) => {
    files.filter((f) => f && f.type && f.type.startsWith('image/')).forEach(async (file) => {
      try {
        const url = await uploadEditorImage(file)
        if (url && editorRef.current) editorRef.current.chain().focus().setImage({ src: url }).run()
      } catch (error) {
        if (onAlertRef.current) onAlertRef.current(error?.message || '이미지 업로드에 실패했습니다.')
      }
    })
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: TEXT.bodyPlaceholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'rte-content' },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || [])
        const images = files.filter((f) => f.type && f.type.startsWith('image/'))
        if (!images.length) return false
        event.preventDefault()
        insertImageFiles(images)
        return true
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files || [])
        const images = files.filter((f) => f.type && f.type.startsWith('image/'))
        if (!images.length) return false
        event.preventDefault()
        insertImageFiles(images)
        return true
      },
    },
  })

  useEffect(() => { editorRef.current = editor }, [editor])

  // 외부 value 동기화 (수정 모드 로딩 등). 입력 중·HTML 직접 작성 모드에는 건드리지 않음.
  useEffect(() => {
    if (!editor || htmlMode) return
    const current = editor.getHTML()
    if ((value || '') !== current && !editor.isFocused) {
      editor.commands.setContent(value || '', false)
    }
  }, [value, editor, htmlMode])

  const toggleHtmlMode = useCallback(() => {
    if (!editor) return
    if (htmlMode) {
      // 리치 모드로 복귀: 작성한 원본 HTML을 에디터에 반영(스키마 미지원 태그는 손실될 수 있음)
      editor.commands.setContent(value || '', false)
      setHtmlMode(false)
    } else {
      // HTML 모드 진입: 현재 에디터 HTML을 원본으로 노출
      onChange(editor.getHTML())
      setHtmlMode(true)
    }
  }, [editor, htmlMode, onChange, value])

  // 임의 HTML 가져오기: .html 파일 선택 → (claude.ai standalone 번들은 자동 해제) 본문 HTML을 추출해
  // 기존 내용 뒤에 덧붙이고 HTML 직접 작성 모드로 전환. script는 게시글 표시 시 자동 제거된다.
  const importHtmlFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm,text/html'
    input.onchange = async () => {
      const file = input.files && input.files[0]
      if (!file) return
      try {
        const raw = await file.text()
        const html = (await extractImportableHtml(raw)).trim()
        if (!html) {
          if (onAlertRef.current) onAlertRef.current('가져올 HTML 내용을 찾지 못했습니다.')
          return
        }
        const current = htmlMode ? (value || '') : (editor ? editor.getHTML() : '')
        const hasBody = current.replace(/<p>\s*<\/p>/gi, '').trim() !== ''
        onChange(hasBody ? `${current}\n${html}` : html)
        setHtmlMode(true)
      } catch (err) {
        if (onAlertRef.current) onAlertRef.current((err && err.message) || 'HTML 가져오기에 실패했습니다.')
      }
    }
    input.click()
  }, [editor, htmlMode, value, onChange])

  const pickImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => { const file = input.files?.[0]; if (file) insertImageFiles([file]) }
    input.click()
  }, [insertImageFiles])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('링크 URL (비우면 제거)', prev)
    if (url === null) return
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }, [editor])

  if (!editor) return <div className="public-editor-shell rte-editor" />

  const inTable = editor.isActive('table')

  return (
    <div className="public-editor-shell rte-editor">
      {allowHtml ? (
        <div className="rte-toolbar rte-mode-bar">
          <RteButton title="HTML 직접 작성 모드" active={htmlMode} onClick={toggleHtmlMode}>{'</>'} HTML 직접 작성</RteButton>
          <RteButton title="HTML 파일 가져오기 — claude.ai standalone 번들 자동 해제 · HTML 직접 작성 모드로 삽입" onClick={importHtmlFile}>⬇ HTML 가져오기</RteButton>
          {htmlMode ? <span className="rte-html-hint">script·iframe·이벤트 핸들러는 표시 시 자동 제거됩니다.</span> : null}
        </div>
      ) : null}
      {htmlMode ? (
        <div className="rte-html-mode">
          <textarea
            className="rte-html-source"
            value={value || ''}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            placeholder={'<div class="notice-box">HTML 코드를 입력하세요</div>'}
          />
          <div className="rte-html-preview">
            <div className="rte-html-preview-label">미리보기</div>
            <div className="rte-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || '') }} />
          </div>
        </div>
      ) : (
      <>
      <div className="rte-toolbar">
        <RteButton title="본문" active={editor.isActive('paragraph') && !editor.isActive('heading')} onClick={() => editor.chain().focus().setParagraph().run()}>본문</RteButton>
        <RteButton title="제목 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</RteButton>
        <RteButton title="제목 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</RteButton>
        <RteButton title="제목 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</RteButton>
        <RteDivider />
        <RteButton title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></RteButton>
        <RteButton title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></RteButton>
        <RteButton title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><span style={{ textDecoration: 'underline' }}>U</span></RteButton>
        <RteButton title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><span style={{ textDecoration: 'line-through' }}>S</span></RteButton>
        <RteButton title="인라인 코드" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>{'</>'}</RteButton>
        <RteDivider />
        <label className="rte-color" title="글자색">
          <span className="rte-color-ico">A</span>
          <input type="color" value={editor.getAttributes('textStyle').color || '#1a2a42'} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
        </label>
        <label className="rte-color" title="형광펜">
          <span className="rte-color-ico rte-color-ico-hl">A</span>
          <input type="color" value={editor.getAttributes('highlight').color || '#fff3a3'} onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()} />
        </label>
        <RteDivider />
        <RteButton title="왼쪽 정렬" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>좌</RteButton>
        <RteButton title="가운데 정렬" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>중</RteButton>
        <RteButton title="오른쪽 정렬" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>우</RteButton>
        <RteButton title="양쪽 정렬" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>양</RteButton>
        <RteDivider />
        <RteButton title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</RteButton>
        <RteButton title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</RteButton>
        <RteButton title="체크리스트" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</RteButton>
        <RteDivider />
        <RteButton title="인용구" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</RteButton>
        <RteButton title="코드 블록" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'{ }'}</RteButton>
        <RteButton title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</RteButton>
        <RteDivider />
        <RteButton title="링크" active={editor.isActive('link')} onClick={setLink}>🔗</RteButton>
        <RteButton title="이미지" onClick={pickImage}>🖼</RteButton>
        <RteButton title="표 삽입(3×3)" active={inTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</RteButton>
        <RteDivider />
        <RteButton title="서식 지우기" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>✕</RteButton>
        <RteButton title="실행취소" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↶</RteButton>
        <RteButton title="다시실행" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↷</RteButton>
      </div>
      {inTable ? (
        <div className="rte-toolbar rte-toolbar-sub">
          <span className="rte-sub-label">표</span>
          <RteButton title="왼쪽에 열 추가" onClick={() => editor.chain().focus().addColumnBefore().run()}>열+◀</RteButton>
          <RteButton title="오른쪽에 열 추가" onClick={() => editor.chain().focus().addColumnAfter().run()}>▶열+</RteButton>
          <RteButton title="열 삭제" onClick={() => editor.chain().focus().deleteColumn().run()}>열−</RteButton>
          <RteDivider />
          <RteButton title="위에 행 추가" onClick={() => editor.chain().focus().addRowBefore().run()}>행+▲</RteButton>
          <RteButton title="아래에 행 추가" onClick={() => editor.chain().focus().addRowAfter().run()}>▼행+</RteButton>
          <RteButton title="행 삭제" onClick={() => editor.chain().focus().deleteRow().run()}>행−</RteButton>
          <RteDivider />
          <RteButton title="셀 병합/분할" onClick={() => editor.chain().focus().mergeOrSplit().run()}>병합/분할</RteButton>
          <RteButton title="머리행 토글" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>머리행</RteButton>
          <RteButton title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()}>표 삭제</RteButton>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      </>
      )}
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
  if (boardName.includes('버그')) return { label: '버그', className: 'bug' }
  if (boardName.includes('자유')) return { label: '자유', className: 'free' }
  return { label: boardName || '게시판', className: 'notice' }
}

// 홈 하단 게시판 카드: 항상 5행(부족분은 빈 슬롯)으로 높이 고정
function renderBoardPreviewRows(posts, navigate, fallbackBoardId, badgeColorFor, badgeLabelFor) {
  const list = Array.isArray(posts) ? posts : []
  return Array.from({ length: 5 }).map((_, i) => {
    const item = list[i]
    if (!item) {
      return (
        <div key={`empty-${i}`} className="notice-row notice-row-empty" aria-hidden="true">
          <span className="home-badge ghost" />
          <b />
          <span className="ndate" />
        </div>
      )
    }
    return (
      <div key={item.id} className="notice-row" onClick={() => navigate(`/?board=${encodeURIComponent(item.board_id || fallbackBoardId || '')}&post=${item.id}`)}>
        <span className={`home-badge ${badgeColorFor(item)}`}>{badgeLabelFor(item)}</span>
        <b>{item.title}</b>
        <span className="ndate">{formatShortDate(item.created_at)}</span>
      </div>
    )
  })
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
  const [themePref, setThemePref] = useState(null)
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
  // 길드 채팅(우측 드로어)
  const [guildChatOpen, setGuildChatOpen] = useState(false)
  const [guildMessages, setGuildMessages] = useState([])
  const [guildHasGuild, setGuildHasGuild] = useState(true)
  const [guildMyName, setGuildMyName] = useState('')
  const [guildInput, setGuildInput] = useState('')
  const guildLastIdRef = useRef(0)
  const guildEchoRef = useRef(new Set())
  const guildListRef = useRef(null)
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
  const [myInquiries, setMyInquiries] = useState([])
  const [myInquiriesLoading, setMyInquiriesLoading] = useState(false)
  const [noticePreviewPosts, setNoticePreviewPosts] = useState([])
  const [communityPreviewPosts, setCommunityPreviewPosts] = useState([])
  const [mediaPreviewPosts, setMediaPreviewPosts] = useState([])
  const [worldServerOnline, setWorldServerOnline] = useState(null)
  const [worldStatusUpdatedAt, setWorldStatusUpdatedAt] = useState('')
  const [serverStats, setServerStats] = useState({ uptimeSeconds: 0, enhance: null, trial: null })
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
  const [grandOpenCountdown, setGrandOpenCountdown] = useState(() => getGrandOpenCountdown())

  const currentBoard = useMemo(() => boards.find((board) => board.id === boardId) || null, [boards, boardId])
  const headerNavItems = useMemo(() => {
    const items = home.nav.filter((item) => ![TEXT.notice, TEXT.community].includes(item.label))
    // 컨텐츠 메뉴 복구: 서버 nav에 없으면 헤더에 추가 (클릭 시 컨텐츠 화면으로 이동)
    if (!items.some((item) => item.label === TEXT.contents)) {
      items.push({ label: TEXT.contents, url: '#contents-section' })
    }
    return items
  }, [home.nav])
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
  const isUpdateBoard = currentBoard?.name?.includes('업데이트')
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
    const updateCountdown = () => {
      setGrandOpenCountdown(getGrandOpenCountdown())
    }
    updateCountdown()
    const timerId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timerId)
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
      if (response && typeof response === 'object' && response.theme) {
        setThemePref(response.theme)
      }
    } catch {
      setUser(null)
    } finally {
      setUserLoaded(true)
    }
  }, [])

  // 활성 테마 적용: /theme/ 스타일시트와 히어로 영상을 캐시버스트로 재요청(서버가 계정별 테마 반환)
  const applyActiveTheme = useCallback(() => {
    const ts = Date.now()
    const link = document.querySelector('link[rel="stylesheet"][href*="/theme/theme.css"]')
    if (link) link.href = `/theme/theme.css?t=${ts}`
    document.querySelectorAll('video.hero-video').forEach((v) => {
      const src = v.querySelector('source')
      if (src) {
        src.src = `/theme/hero.mp4?t=${ts}`
        try { v.load(); const p = v.play(); if (p && p.catch) p.catch(() => {}) } catch (e) { /* noop */ }
      }
    })
  }, [])

  // 스위치 토글: 낙관적 UI → 계정에 저장 → 즉시 reskin
  const handleToggleTheme = useCallback(async () => {
    const current = themePref || (user && user.theme) || 'stormwind'
    const next = current === 'orgrimmar' ? 'stormwind' : 'orgrimmar'
    setThemePref(next)
    try {
      await apiFetch('/api/user/theme', { method: 'POST', body: JSON.stringify({ theme: next }) })
      applyActiveTheme()
    } catch (e) {
      setThemePref(current)
    }
  }, [themePref, user, applyActiveTheme])

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
      const response = await apiFetch('/api/server/home-stats')
      setWorldServerOnline(response?.world_running === true)
      setWorldStatusUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
      setServerStats({
        uptimeSeconds: Number(response?.uptime_seconds || 0),
        enhance: response?.enhance || null,
        trial: response?.trial || null,
      })
    } catch {
      // home-stats 엔드포인트가 아직 없으면 기존 world-status로 폴백
      try {
        const fallback = await apiFetch('/api/server/world-status')
        setWorldServerOnline(fallback?.world_running === true)
        setWorldStatusUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
      } catch {
        setWorldServerOnline(false)
        setWorldStatusUpdatedAt('확인 실패')
      }
      setServerStats({ uptimeSeconds: 0, enhance: null, trial: null })
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
      const query = new URLSearchParams({ board_id: targetBoardId, page: String(targetPage), limit: '10' })
      if (targetSearch) query.set('search', targetSearch)
      const response = await apiFetch(`/api/board/posts?${query.toString()}`)
      setPosts(asArray(response?.posts))
      setTotalPages(Number(response?.totalPages || 1))
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  const loadMyInquiries = useCallback(async () => {
    setMyInquiriesLoading(true)
    try {
      const query = new URLSearchParams({ board_id: 'inquiry', page: '1', limit: '30' })
      const response = await apiFetch(`/api/board/posts?${query.toString()}`)
      setMyInquiries(asArray(response?.posts))
    } finally {
      setMyInquiriesLoading(false)
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
    if (!user || (screen !== 'notifications' && screen !== 'mynoti')) return
    loadNotificationCenter(notificationPage, notificationSearch, notificationCategory).catch(async (error) => {
      await showAlert(error?.message || '알림 목록을 불러오지 못했습니다.')
    })
  }, [loadNotificationCenter, notificationCategory, notificationPage, notificationSearch, screen, showAlert, user])

  // 길드 채팅: 로드(initial=최근 100/리셋, 그 외=증분 폴링)
  const loadGuildChat = useCallback(async (initial) => {
    try {
      const after = initial ? 0 : guildLastIdRef.current
      const data = await apiFetch(`/api/chat/guild/fetch?after=${after}${initial ? '&limit=100' : ''}`)
      if (!data) return
      setGuildHasGuild(!!data.guild)
      if (data.myName) setGuildMyName(data.myName)
      const newLast = Number(data.lastId) || 0
      guildLastIdRef.current = initial ? newLast : Math.max(guildLastIdRef.current, newLast)
      const items = asArray(data.items)
      if (initial) {
        guildEchoRef.current = new Set()
        setGuildMessages(items)
      } else if (items.length) {
        const echo = guildEchoRef.current
        const fresh = items.filter((it) => { const k = Number(it.id); if (echo.has(k)) { echo.delete(k); return false } return true })
        if (fresh.length) setGuildMessages((prev) => [...prev, ...fresh])
      }
    } catch (e) { /* 폴링 실패 무시 */ }
  }, [])

  // 길드 채팅: 전송(대표 캐릭터, GM 아님) + 낙관적 echo
  const sendGuildChat = useCallback(async () => {
    const message = guildInput.trim()
    if (!message) return
    try {
      const data = await apiFetch('/api/chat/guild/send', { method: 'POST', body: JSON.stringify({ message }) })
      if (data && data.status === 'success') {
        setGuildInput('')
        if (data.sender) setGuildMyName(data.sender)
        if (data.echoId) guildEchoRef.current.add(Number(data.echoId))
        const sender = data.sender || guildMyName
        setGuildMessages((prev) => [...prev, { id: `echo-${data.echoId || Date.now()}`, chat_type: 'guild', sender_name: sender, sender_gm: 0, message, created_at: '' }])
      }
    } catch (e) {
      let msg = '전송에 실패했습니다.'
      try { const j = JSON.parse(e?.message || '{}'); if (j.message) msg = j.message } catch (_) { /* keep */ }
      await showAlert(msg)
    }
  }, [guildInput, guildMyName, showAlert])

  // 길드 채팅 드로어 열림 시 초기 로드 + 4초 폴링
  useEffect(() => {
    if (!guildChatOpen || !user) return undefined
    loadGuildChat(true)
    const t = setInterval(() => loadGuildChat(false), 4000)
    return () => clearInterval(t)
  }, [guildChatOpen, user, loadGuildChat])

  // 새 메시지 시 하단으로 스크롤
  useEffect(() => {
    if (guildChatOpen && guildListRef.current) {
      const el = guildListRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [guildMessages, guildChatOpen])

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
      else if (nextView === 'myinfo' && user) setScreen('myinfo')
      else if (nextView === 'characters' && user) setScreen('characters')
      else if (nextView === 'points' && user) setScreen('points')
      else if (nextView === 'mynoti' && user) setScreen('mynoti')
      else if (nextView === 'myinquiries' && user) setScreen('myinquiries')
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
    if ((screen !== 'mypage' && screen !== 'characters' && screen !== 'myinfo') || !user) return
    loadMyPageCharacters().catch((error) => { void showAlert(error?.message || '캐릭터 목록을 불러오지 못했습니다.') })
  }, [loadMyPageCharacters, screen, showAlert, user])

  useEffect(() => {
    if ((screen !== 'mypage' && screen !== 'points') || !user) return
    loadMyPagePointHistory(myPagePointPage).catch((error) => { void showAlert(error?.message || '포인트 내역을 불러오지 못했습니다.') })
  }, [loadMyPagePointHistory, myPagePointPage, screen, showAlert, user])

  useEffect(() => {
    if (screen !== 'myinquiries' || !user) return
    loadMyInquiries().catch((error) => { void showAlert(error?.message || '문의 내역을 불러오지 못했습니다.') })
  }, [loadMyInquiries, screen, showAlert, user])

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

  // 홈 "핵심 콘텐츠" 카드 → 해당 컨텐츠 상세(있으면) / 없으면 컨텐츠 목록
  const goToContent = useCallback((contentId) => {
    if (contentId && contentItems.some((item) => item.id === contentId)) {
      openContentDetail(contentId)
    } else {
      openContents()
    }
  }, [contentItems, openContentDetail, openContents])

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
    if (currentBoard?.name?.includes('업데이트')) setContent(UPDATE_TEMPLATE)
    setDetail(null)
    setScreen('write')
    navigate(`/?board=${encodeURIComponent(currentBoard.id)}&write=1`)
  }, [currentBoard, navigate, resetWriteState, showAlert, user])

  const loadUpdateTemplate = useCallback(async () => {
    if (String(content || '').replace(/<[^>]*>/g, '').trim()) {
      const ok = await showConfirm('현재 작성 중인 내용을 업데이트 양식으로 덮어쓸까요?')
      if (!ok) return
    }
    setContent(UPDATE_TEMPLATE)
  }, [content, showConfirm])

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

  const copyPostUrl = useCallback(async () => {
    if (!detail?.post?.id || !currentBoard) return
    const url = `${window.location.origin}/?board=${encodeURIComponent(currentBoard.id)}&post=${detail.post.id}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      await showAlert('게시글 주소가 복사되었습니다.')
    } catch (error) {
      await showAlert(`주소 복사에 실패했습니다. 직접 복사해 주세요:\n${url}`)
    }
  }, [currentBoard, detail, showAlert])

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
      payload.promotion_urls = urls
    } else if (!stripHtmlText(payload.content) && !/<(img|table|hr)/i.test(payload.content || '')) {
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
  const headerWelcomeText = hasMainCharacter ? welcomeName : '대표 캐릭터 미설정'
  const headerPointText = `${Number(user?.points || 0).toLocaleString()} point`
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
          <button className="nav-brand nav-link-button" type="button" onClick={goHome}>
            <span className="brand-name">Karazhan<small>Wrath of the Lich King</small></span>
          </button>
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
              {/* 테마 전환 스위치 — 계정별 저장(다음 접속에도 유지) */}
              <button
                type="button"
                className={`theme-switch ${((themePref || user.theme) === 'orgrimmar') ? 'is-orgrimmar' : 'is-stormwind'}`}
                role="switch"
                aria-checked={(themePref || user.theme) === 'orgrimmar'}
                aria-label="테마 전환: 스톰윈드 / 오그리마"
                title="테마 전환 (스톰윈드 / 오그리마)"
                onClick={handleToggleTheme}
              >
                <span className="theme-switch-side theme-switch-side--stormwind" aria-hidden="true">
                  <span className="theme-switch-crest" />
                  <span className="theme-switch-name">스톰윈드</span>
                </span>
                <span className="theme-switch-side theme-switch-side--orgrimmar" aria-hidden="true">
                  <span className="theme-switch-name">오그리마</span>
                  <span className="theme-switch-crest" />
                </span>
                <span className="theme-switch-knob" aria-hidden="true" />
              </button>
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
                  <span className="nav-notification-icon" aria-hidden="true"><BellIcon /></span>
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
              <button
                type="button"
                className="nav-notification-btn button-reset"
                aria-label="길드 채팅 열기"
                aria-expanded={guildChatOpen}
                onClick={() => { setNotificationOpen(false); setUserMenuOpen(false); setGuildChatOpen((prev) => !prev) }}
              >
                <span className="nav-notification-icon" aria-hidden="true"><ChatIcon /></span>
              </button>
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
                  <span className="nav-user-text"><strong>{headerWelcomeText}</strong><small>{headerPointText}</small></span>
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
      </header>
      {user && guildChatOpen ? (
        <aside className="guild-chat-drawer">
          <div className="guild-chat-head">
            <strong>길드 채팅</strong>
            <button type="button" className="button-reset guild-chat-close" aria-label="닫기" onClick={() => setGuildChatOpen(false)}>✕</button>
          </div>
          <div className="guild-chat-body" ref={guildListRef}>
            {!guildHasGuild ? (
              <div className="guild-chat-empty">가입된 길드가 없습니다.<br />대표 캐릭터가 길드에 가입하면 이용할 수 있어요.</div>
            ) : (!guildMessages.length ? (
              <div className="guild-chat-empty">아직 길드 대화가 없습니다.</div>
            ) : guildMessages.map((m) => {
              const mine = guildMyName && String(m.sender_name || '') === guildMyName
              const time = String(m.created_at || '').slice(11, 16)
              return (
                <div key={`g-${m.id}`} className={`guild-msg${mine ? ' mine' : ''}`}>
                  {!mine ? <span className="guild-msg-name">{m.sender_name}{Number(m.sender_gm) ? ' <GM>' : ''}</span> : null}
                  <div className="guild-msg-row">
                    <span className="guild-msg-bubble">{m.message}</span>
                    {time ? <span className="guild-msg-time">{time}</span> : null}
                  </div>
                </div>
              )
            }))}
          </div>
          <div className="guild-chat-composer">
            <input
              type="text"
              value={guildInput}
              maxLength={512}
              placeholder={guildHasGuild ? '길드 채팅 입력' : '길드 없음'}
              disabled={!guildHasGuild}
              onChange={(e) => setGuildInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendGuildChat() } }}
            />
            <button type="button" className="btn" disabled={!guildHasGuild} onClick={sendGuildChat}>전송</button>
          </div>
        </aside>
      ) : null}
      {mobileNavOpen ? <button type="button" className="nav-mobile-overlay button-reset" aria-label="모바일 메뉴 닫기" onClick={() => setMobileNavOpen(false)} /> : null}
      <div id="mobile-nav-panel" className={`nav-mobile-panel${mobileNavOpen ? ' active' : ''}`}>
        <div className="nav-mobile-head">
          <span className="nav-mobile-head-brand">Karazhan</span>
          <button type="button" className="nav-mobile-close button-reset" aria-label="메뉴 닫기" onClick={() => setMobileNavOpen(false)}>✕</button>
        </div>
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

      <main>
        {!boardId && screen === 'home' && (
          <>
            <section className="hero" aria-label="카라잔 소개" style={{ '--public-hero-bg': `url(${home.hero.background})` }}>
              <div className="hero-video-wrap" aria-hidden="true">
                <video className="hero-video" autoPlay muted loop playsInline preload="auto">
                  <source src="/theme/hero.mp4" type="video/mp4" />
                </video>
              </div>
              <div className="hero-inner">
                <div className="hero-headline">
                  <h1 className="hero-title-main">Karazhan</h1>
                  <span className="hero-subtitle-main">Wrath of the Lich King</span>
                  <p className="hero-desc-main">클래식 감성 · 성장형 PvE 서버</p>
                </div>
                <div className="hero-cards">
                <div className="hero-copy hero-countdown-card hero-countdown-ring-card" aria-live="polite">
                  <span className="hero-countdown-kicker">KARAZHAN GRAND OPEN</span>
                  <div className="hero-ring">
                    <svg viewBox="0 0 300 300" aria-hidden="true">
                      <defs>
                        <linearGradient id="heroRingGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="var(--kz-hero-from)" />
                          <stop offset="1" stopColor="var(--kz-hero-to)" />
                        </linearGradient>
                      </defs>
                      <circle className="hero-ring-track" cx="150" cy="150" r="132" />
                      <circle className="hero-ring-arc" cx="150" cy="150" r="132" style={{ strokeDasharray: 2 * Math.PI * 132, strokeDashoffset: 2 * Math.PI * 132 * (1 - (grandOpenCountdown.progress ?? 0)) }} />
                    </svg>
                    <div className="hero-ring-center">
                      <span className="hero-countdown-dday">{grandOpenCountdown.dayLabel}</span>
                      <span className="hero-countdown-time">{grandOpenCountdown.timeLabel}</span>
                    </div>
                  </div>
                  <strong className="hero-countdown-date">2026년 6월 19일 00시 OPEN</strong>
                  <p className="hero-countdown-caption">{grandOpenCountdown.caption}</p>
                </div>
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
              </div>
            </section>

            <section className="server-info" aria-label="서버 정보">
              <div className="server-title">Server Info</div>
              <div className="server-item"><span className="server-icon">🛡</span><span><small>클라이언트</small><b>3.3.5a</b></span></div>
              <div className="server-item"><span className="server-icon">🛡</span><span><small>시작레벨</small><b>70</b></span></div>
              <div className="server-item"><span className="server-icon">⚔</span><span><small>퀘배율</small><b>x5</b></span></div>
              <div className="server-item"><span className="server-icon">!</span><span><small>퀘스트</small><b>x5</b></span></div>
              <div className="server-item"><span className="server-icon">💰</span><span><small>드랍배율</small><b>x3</b></span></div>
              <div className="server-item"><span className="server-icon">⚖</span><span><small>전문기술</small><b>x3</b></span></div>
            </section>

            <section className="section mobile-hide">
              <h2 className="section-title"><span>핵심 콘텐츠</span></h2>
              <div className="content-grid">
                {[
                  { id: '시련', img: '/img/contents/시련.png', alt: '시련', title: '시련', desc: ['강력한 보스와의 시련!', '보상을 쟁취하라!'] },
                  { id: '강화', img: '/img/contents/강화.png', alt: '아이템 강화', title: '아이템 강화', desc: ['1부터 10까지!', '한계를 뛰어넘는 강화 시스템!'] },
                  { id: '영웅석_룬문자', img: '/img/contents/영웅석_룬문자.png', alt: '영웅석', title: '영웅석', desc: ['룬문자를 통한', '순간이동 시스템!'] },
                  { id: '형상변환', img: '/img/shop/종족변경.png', alt: '형상변환', title: '형상변환', desc: ['다양한 외형을 수집하고', '나만의 스타일을 완성하라!'] },
                ].map((card) => (
                  <article
                    key={card.title}
                    className="feature-card feature-card--link"
                    role="button"
                    tabIndex={0}
                    onClick={() => goToContent(card.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToContent(card.id) } }}
                  >
                    <img src={card.img} alt={card.alt} />
                    <h3>{card.title}</h3>
                    <p>{card.desc[0]}<br />{card.desc[1]}</p>
                  </article>
                ))}
              </div>
              <div className="section-more">
                <button type="button" className="btn" onClick={openContents}>더보기</button>
              </div>
            </section>

            <section className="section main-info-grid">
              <article className="why-card">
                <div className="why-image"></div>
                <div className="why-copy">
                  <h2>Why Karazhan?</h2>
                  <div className="check-list">
                    <span>성장형 PvE 콘텐츠</span>
                    <span>다양한 편의 기능</span>
                    <span>솔로 플레이 지원</span>
                    <span>커스텀 보상 시스템</span>
                    <span>장비 강화 시스템</span>
                    <span>지속적인 업데이트</span>
                  </div>
                </div>
              </article>
              <aside className={`status-card ${worldServerOnline === false ? 'offline' : worldServerOnline === null ? 'checking' : 'online'}`}>
                <h3>실시간 서버 현황</h3>
                <div className="status-row"><i>●</i><span>월드 서버</span><b className={worldServerOnline ? 'green' : ''}>{worldServerOnline === null ? '확인중' : worldServerOnline ? 'ON' : 'OFF'}</b></div>
                <div className="status-row"><i>⏱</i><span>런닝 타임</span><b>{worldServerOnline ? formatUptime(serverStats.uptimeSeconds) : '-'}</b></div>
                <div className="status-row"><i>⚔</i><span>최근 강화 성공</span><b>{serverStats.enhance ? `+${serverStats.enhance.level} ${serverStats.enhance.item}` : '-'}</b></div>
                <div className="status-row"><i>🏆</i><span>최근 시련 성공</span><b>{serverStats.trial ? (serverStats.trial.stage || serverStats.trial.player || '-') : '-'}</b></div>
              </aside>
            </section>

            <section className="section downloads">
              <h2 className="section-title"><span>게임 다운로드</span></h2>
              <div className="download-grid">
                <article className="download-card"><div className="download-icon">🛡</div><div><h3>풀 클라이언트</h3><p>전체 파일 다운로드</p><a className="blue-btn" href={CONNECT_CLIENT_DOWNLOAD_URL} target="_blank" rel="noreferrer noopener">다운로드 ↓</a></div></article>
                <article className="download-card"><div className="download-icon">📜</div><div><h3>패치 파일</h3><p>최신 패치 파일 다운로드</p><button className="blue-btn button-reset" type="button" onClick={openConnectGuide}>다운로드 ↓</button></div></article>
                <article className="download-card"><div className="download-icon">🔭</div><div><h3>접속기 다운로드</h3><p>게임 접속 프로그램</p><a className="blue-btn" href={CONNECT_LAUNCHER_DOWNLOAD_URL} target="_blank" rel="noreferrer noopener">다운로드 ↓</a></div></article>
              </div>
            </section>
            <section id="notice-section" className="section bottom-grid bottom-grid-3">
              <article className="notice-card">
                <div className="card-head"><h2>공지사항</h2><button type="button" className="more button-reset" onClick={() => openBoard(noticeBoard?.id || visibleBoards[0]?.id)}>더보기 +</button></div>
                {renderBoardPreviewRows(
                  noticePreviewPosts,
                  navigate,
                  noticeBoard?.id,
                  (item) => ({ notice: 'red', bug: 'red', update: 'blue', free: 'green', event: 'green', guide: 'blue' }[getBoardPreviewTag(item.board_name).className] || 'blue'),
                  (item) => getBoardPreviewTag(item.board_name).label,
                )}
              </article>
              <article className="notice-card">
                <div className="card-head"><h2>업데이트</h2><button type="button" className="more button-reset" onClick={() => openBoard(visibleBoards.find((board) => board.name.includes('업데이트'))?.id || visibleBoards[0]?.id)}>더보기 +</button></div>
                {renderBoardPreviewRows(
                  mediaPreviewPosts,
                  navigate,
                  null,
                  () => 'blue',
                  (item) => (item.version && String(item.version)) || '업데이트',
                )}
              </article>
              <article className="notice-card">
                <div className="card-head"><h2>자유게시판</h2><button type="button" className="more button-reset" onClick={() => openBoard(freeBoard?.id || visibleBoards[0]?.id)}>더보기 +</button></div>
                {renderBoardPreviewRows(
                  communityPreviewPosts,
                  navigate,
                  freeBoard?.id,
                  () => 'green',
                  () => '자유',
                )}
              </article>
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
                      {item.type === 'html' ? (
                        <div className="contents-feature-thumb contents-feature-thumb--html">
                          <iframe
                            src={item.url}
                            className="contents-thumb-frame"
                            title={`${item.title} 미리보기`}
                            scrolling="no"
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                        </div>
                      ) : (
                        <div className="contents-feature-thumb" style={{ '--bg-img': `url('${item.image}')` }}></div>
                      )}
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
                    {selectedContentItem?.type === 'html' ? (
                      <iframe
                        src={selectedContentItem?.url || ''}
                        title={`${selectedContentItem?.title || '컨텐츠'} 안내`}
                        className="guide-view-html"
                        scrolling="no"
                        onLoad={(e) => {
                          const f = e.currentTarget
                          const fit = () => {
                            try {
                              const doc = f.contentDocument
                              if (doc) {
                                const h = Math.max(
                                  doc.documentElement?.scrollHeight || 0,
                                  doc.body?.scrollHeight || 0,
                                )
                                if (h > 0) f.style.height = h + 'px'
                              }
                            } catch (_) { /* 동일 출처 아닐 때 무시 */ }
                          }
                          fit()
                          setTimeout(fit, 400)
                        }}
                      />
                    ) : (
                      <img
                        src={selectedContentItem?.image || ''}
                        alt={`${selectedContentItem?.title || '컨텐츠'} 안내`}
                        className="guide-view-image"
                      />
                    )}
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
                <section id="mypage-profile" className="mypage-card mypage-profile-card">
                  <div className="mypage-profile-main">
                    <div className="mypage-avatar-frame">
                      <img src={getRaceIcon(myPageMainCharacter?.race, myPageMainCharacter?.gender)} alt={`${welcomeName} 대표 캐릭터`} />
                    </div>
                    <div className="mypage-profile-copy">
                      <div className="mypage-name-row">
                        <strong>{user.username || welcomeName}</strong>
                        {isAdmin(user) ? <span className="mypage-badge">관리자</span> : null}
                      </div>
                      <div className="mypage-mobile-cls">{myPageMainCharacter ? `${myPageMainCharacter.level} 레벨 · ${getClassName(myPageMainCharacter.class)}` : '대표 캐릭터 미설정'}</div>
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

                <nav className="mypage-mobile-menu" aria-label="마이페이지 메뉴">
                  <button type="button" className="mp-row" onClick={() => navigate('/?view=myinfo')}><span className="ic" aria-hidden="true">👤</span>내 정보<span className="cv" aria-hidden="true">›</span></button>
                  <button type="button" className="mp-row" onClick={() => navigate('/?view=characters')}><span className="ic" aria-hidden="true">🛡</span>캐릭터 관리<span className="cv" aria-hidden="true">›</span></button>
                  <button type="button" className="mp-row" onClick={() => navigate('/?view=points')}><span className="ic" aria-hidden="true">◈</span>포인트 내역<span className="cv" aria-hidden="true">›</span></button>
                  <button type="button" className="mp-row" onClick={() => navigate('/?view=mynoti')}><span className="ic" aria-hidden="true">🔔</span>알림함<span className="cv" aria-hidden="true">›</span></button>
                  <button type="button" className="mp-row" onClick={() => navigate('/?view=myinquiries')}><span className="ic" aria-hidden="true">✉</span>문의 내역<span className="cv" aria-hidden="true">›</span></button>
                </nav>

                <section id="mypage-characters" className="mypage-card mypage-character-section">
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

                <section id="mypage-points" className="mypage-card mypage-points-card">
                  <div className="mypage-section-head">
                    <h3>포인트 이용 내역</h3>
                    <span className="public-board-status">
                      {myPagePointLoading ? '불러오는 중...' : `페이지 ${myPagePointPage} / ${myPagePointTotalPages}`}
                    </span>
                  </div>
                  <ul className="mypage-mobile-points">
                    {myPagePointLogs.length ? myPagePointLogs.slice(0, 4).map((log, index) => (
                      <li key={`mp-${log.createdAt || 'pt'}-${index}`} className="pt-row">
                        <div className="pt-info">
                          <div className="rs">{log.reason || '-'}</div>
                          <div className="dt">{formatDate(log.createdAt).slice(0, 10).replace(/-/g, '.')}</div>
                        </div>
                        <div className={`am ${Number(log.amount || 0) >= 0 ? 'plus' : 'minus'}`}>
                          {Number(log.amount || 0) >= 0 ? '+' : ''}{Number(log.amount || 0).toLocaleString()} P
                        </div>
                      </li>
                    )) : (
                      <li className="pt-row pt-empty">{myPagePointLoading ? '포인트 내역을 불러오는 중입니다.' : '포인트 이용 내역이 없습니다.'}</li>
                    )}
                  </ul>
                  {myPagePointLogs.length > 4 ? (
                    <button type="button" className="mypage-points-more" onClick={() => navigate('/?view=points')}>포인트 내역 전체 보기 ›</button>
                  ) : null}
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

                <div className="mypage-mobile-logout">
                  <button type="button" className="btn mypage-logout-btn" onClick={handleLogout}>로그아웃</button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'myinfo' && user ? (
          <section className="section">
            <div className="mypage-subpage">
              <div className="mypage-subpage-head">
                <button type="button" className="mypage-back-btn" onClick={() => navigate('/?view=mypage')}>‹ 마이페이지</button>
                <h2>내 정보</h2>
              </div>
              <div className="mypage-card mypage-info-card">
                <div className="mypage-info-row"><span>아이디</span><strong>{user.username || '-'}</strong></div>
                <div className="mypage-info-row"><span>이메일</span><strong>{user.email || '미등록'}</strong></div>
                <div className="mypage-info-row"><span>웹 포인트</span><strong>{Number(user.points || 0).toLocaleString()} P</strong></div>
                <div className="mypage-info-row"><span>회원 등급</span><strong>{isAdmin(user) ? '관리자' : '일반 회원'}</strong></div>
                <div className="mypage-info-row"><span>대표 캐릭터</span><strong>{myPageMainCharacter?.name || '미설정'}</strong></div>
                <div className="mypage-info-row"><span>종족 / 직업</span><strong>{myPageMainCharacter ? `${getRaceName(myPageMainCharacter.race)} / ${getClassName(myPageMainCharacter.class)}` : '-'}</strong></div>
                <div className="mypage-info-row"><span>레벨</span><strong>{myPageMainCharacter ? `Lv.${myPageMainCharacter.level}` : '-'}</strong></div>
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'characters' && user ? (
          <section className="section">
            <div className="mypage-subpage">
              <div className="mypage-subpage-head">
                <button type="button" className="mypage-back-btn" onClick={() => navigate('/?view=mypage')}>‹ 마이페이지</button>
                <h2>캐릭터 관리</h2>
              </div>
              <div className="mypage-card">
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
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'points' && user ? (
          <section className="section">
            <div className="mypage-subpage">
              <div className="mypage-subpage-head">
                <button type="button" className="mypage-back-btn" onClick={() => navigate('/?view=mypage')}>‹ 마이페이지</button>
                <h2>포인트 내역</h2>
              </div>
              <div className="mypage-card">
                <ul className="mypage-mobile-points mypage-subpage-points">
                  {myPagePointLogs.length ? myPagePointLogs.map((log, index) => (
                    <li key={`sp-${log.createdAt || 'pt'}-${index}`} className="pt-row">
                      <div className="pt-info">
                        <div className="rs">{log.reason || '-'}</div>
                        <div className="dt">{formatDate(log.createdAt).slice(0, 10).replace(/-/g, '.')}</div>
                      </div>
                      <div className={`am ${Number(log.amount || 0) >= 0 ? 'plus' : 'minus'}`}>
                        {Number(log.amount || 0) >= 0 ? '+' : ''}{Number(log.amount || 0).toLocaleString()} P
                      </div>
                    </li>
                  )) : (
                    <li className="pt-row pt-empty">{myPagePointLoading ? '포인트 내역을 불러오는 중입니다.' : '포인트 이용 내역이 없습니다.'}</li>
                  )}
                </ul>
                {myPagePointTotalPages > 1 ? (
                  <div className="public-board-pager">
                    <button type="button" disabled={myPagePointLoading || myPagePointPage <= 1} onClick={() => setMyPagePointPage((prev) => Math.max(1, prev - 1))}>{TEXT.previous}</button>
                    <button type="button" disabled>{myPagePointPage} / {myPagePointTotalPages}</button>
                    <button type="button" disabled={myPagePointLoading || myPagePointPage >= myPagePointTotalPages} onClick={() => setMyPagePointPage((prev) => Math.min(myPagePointTotalPages, prev + 1))}>{TEXT.next}</button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'mynoti' && user ? (
          <section className="section">
            <div className="mypage-subpage">
              <div className="mypage-subpage-head">
                <button type="button" className="mypage-back-btn" onClick={() => navigate('/?view=mypage')}>‹ 마이페이지</button>
                <h2>알림함</h2>
              </div>
              <div className="mypage-card">
                <div className="mypage-section-head">
                  <h3>받은 알림</h3>
                  <span className="public-board-status">{notificationCenterLoading ? '불러오는 중...' : `안읽음 ${notificationUnreadCount}개`}</span>
                </div>
                <ul className="mypage-noti-list">
                  {notificationCenterLoading ? (
                    <li className="mypage-noti-empty">알림을 불러오는 중입니다.</li>
                  ) : notifications.length ? notifications.map((n) => {
                    const meta = notificationTypeMeta(n.type)
                    return (
                      <li key={`mynoti-${n.id}`} className={`mypage-noti-item${n.is_read ? '' : ' unread'}`} onClick={() => { void openNotificationTarget(n) }}>
                        <span className={`mypage-noti-ic ${meta.className}`} aria-hidden="true">{meta.icon}</span>
                        <div className="mypage-noti-body">
                          <div className="mypage-noti-top"><strong>{n.title || '알림'}</strong><span className="mypage-noti-kind">{notificationTypeLabel(n.type)}</span></div>
                          <div className="mypage-noti-msg">{n.message || '-'}</div>
                          <div className="mypage-noti-dt">{formatNotificationTime(n.created_at)}</div>
                        </div>
                      </li>
                    )
                  }) : (
                    <li className="mypage-noti-empty">받은 알림이 없습니다.</li>
                  )}
                </ul>
                {notificationTotalPages > 1 ? (
                  <div className="public-board-pager">
                    <button type="button" disabled={notificationCenterLoading || notificationPage <= 1} onClick={() => setNotificationPage((p) => Math.max(1, p - 1))}>{TEXT.previous}</button>
                    <button type="button" disabled>{notificationPage} / {notificationTotalPages}</button>
                    <button type="button" disabled={notificationCenterLoading || notificationPage >= notificationTotalPages} onClick={() => setNotificationPage((p) => Math.min(notificationTotalPages, p + 1))}>{TEXT.next}</button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {!boardId && screen === 'myinquiries' && user ? (
          <section className="section">
            <div className="mypage-subpage">
              <div className="mypage-subpage-head">
                <button type="button" className="mypage-back-btn" onClick={() => navigate('/?view=mypage')}>‹ 마이페이지</button>
                <h2>문의 내역</h2>
              </div>
              <div className="mypage-card">
                <div className="mypage-section-head">
                  <h3>내 문의</h3>
                  <span className="public-board-status">{myInquiriesLoading ? '불러오는 중...' : `${myInquiries.length}건`}</span>
                </div>
                <ul className="mypage-inquiry-list">
                  {myInquiriesLoading ? (
                    <li className="mypage-inquiry-empty">문의 내역을 불러오는 중입니다.</li>
                  ) : myInquiries.length ? myInquiries.map((post) => (
                    <li key={`myinq-${post.id}`} className="mypage-inquiry-item" onClick={() => navigate(`/?board=inquiry&post=${post.id}`)}>
                      <div className="mypage-inquiry-main">
                        <div className="mypage-inquiry-title">
                          {post.category ? <span className="tag event">{post.category}</span> : null}
                          <span>{post.title}</span>
                          {Number(post.comment_count || 0) > 0 ? <b>[{post.comment_count}]</b> : null}
                        </div>
                        <div className="mypage-inquiry-meta">{formatDate(post.created_at).slice(0, 10).replace(/-/g, '.')} · 조회 {Number(post.views || 0).toLocaleString()}</div>
                      </div>
                      {renderSupportStatus(post.inquiry_status)}
                    </li>
                  )) : (
                    <li className="mypage-inquiry-empty">등록한 문의가 없습니다.</li>
                  )}
                </ul>
                <button type="button" className="mypage-subpage-action" onClick={() => navigate('/?board=inquiry&write=1')}>새 문의 작성하기 ›</button>
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
                  <button type="button" disabled={notificationPage <= 1} onClick={() => setNotificationPage((prev) => Math.max(1, prev - 1))}>‹</button>
                  <button type="button" className="is-active" disabled>{notificationPage}</button>
                  <button type="button" disabled={notificationPage >= notificationTotalPages} onClick={() => setNotificationPage((prev) => Math.min(notificationTotalPages, prev + 1))}>›</button>
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
                      <div className="public-board-title-wrap">
                        <h2>{currentBoard.name}</h2>
                        <p className="public-board-sub">{currentBoard.description || `${currentBoard.name} 게시글을 확인할 수 있습니다.`}</p>
                      </div>
                      <div className="public-board-toolbar">
                        <button className="btn public-board-home-btn" type="button" onClick={goHome}>{TEXT.home}</button>
                        {canWrite(currentBoard, user) ? <button className="btn public-write-btn" type="button" onClick={openWrite}>{TEXT.write}</button> : null}
                      </div>
                    </div>

                    <nav className="public-board-chips" aria-label="게시판 바로가기">
                      {visibleBoards.map((board) => (
                        <button
                          key={board.id}
                          type="button"
                          className={`public-board-chip${board.id === boardId ? ' on' : ''}`}
                          onClick={() => openBoard(board.id)}
                        >
                          {board.name}
                        </button>
                      ))}
                    </nav>

                    <div className="public-board-search-wrap">
                      <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(searchInput.trim()) } }} placeholder="검색어를 입력해 주세요." />
                      <button className="btn" type="button" onClick={() => { setPage(1); setSearch(searchInput.trim()) }}>{TEXT.search}</button>
                    </div>

                    <div className="public-mobile-post-list-wrap">
                      {!isUpdateBoard ? (
                        <div className="public-post-list-head">
                          <span>번호</span><span>제목</span><span>작성자</span><span>작성일</span><span>{isBugReportBoard ? '상태' : '조회'}</span>
                        </div>
                      ) : null}
                      {loadingPosts ? (
                        <div className="empty-cell public-mobile-post-empty">{TEXT.loadingPosts}</div>
                      ) : (
                        <ul className={`public-mobile-post-list${isUpdateBoard ? '' : ' public-mobile-post-list-fixed'}`}>
                          {Array.from({ length: 10 }).map((_, index) => {
                            const post = posts[index]
                            if (!post) {
                              return (
                                <li key={`empty-${index}`} className="public-mobile-post public-mobile-post-empty-slot" aria-hidden="true">
                                  <span className="public-post-no" />
                                  <span className="public-mobile-post-main" />
                                  <span className="public-mobile-post-meta" />
                                  <span className="public-mobile-post-date" />
                                  <span className="public-mobile-post-count" />
                                </li>
                              )
                            }
                            const summary = stripHtmlText(post.content || '')
                            const tag = getBoardPreviewTag(currentBoard.name)
                            return (
                              <li
                                key={post.id}
                                className={`public-mobile-post${isUpdateBoard ? ' public-update-post' : ''}`}
                                onClick={() => {
                                  navigate(`/?board=${encodeURIComponent(currentBoard.id)}&post=${post.id}`)
                                }}
                              >
                                <span className="public-post-no">{post.display_number ?? (index + 1)}</span>
                                <span className="public-mobile-post-main">
                                  <span className="public-mobile-post-title">
                                    {renderVersionBadge(post.version)}
                                    {!post.version ? (isBugReportBoard && post.category ? <span className="tag bug">{post.category}</span> : <span className={`tag ${tag.className}`}>{tag.label}</span>) : null}
                                    <span>{post.title}</span>
                                    {Number(post.comment_count || 0) > 0 ? <b>[{post.comment_count}]</b> : null}
                                  </span>
                                  {summary ? <span className="public-mobile-post-summary">{summary}</span> : null}
                                </span>
                                <span className="public-mobile-post-meta public-mobile-post-author">{renderAuthor(post.author_name, post.is_staff_author, post.has_enhanced_stone)}</span>
                                <span className="public-mobile-post-date"><span className="pmp-date-full">{formatDate(post.created_at)}</span><span className="pmp-date-short">{formatDate(post.created_at).slice(0, 10).replace(/-/g, '.')}</span></span>
                                <span className="public-mobile-post-count">{isBugReportBoard ? renderSupportStatus(post.inquiry_status) : Number(post.views || 0).toLocaleString()}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="public-board-pager">
                      <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>‹</button>
                      <button type="button" className="is-active" disabled>{page}</button>
                      <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>›</button>
                    </div>
                  </>
                )}
                {screen === 'detail' && detail?.post ? (
                  <>
                    <div className={`public-board-head public-detail-head${isUpdateBoard ? ' public-update-hero' : ''}`}><div><h2><span className="public-detail-title">{renderVersionBadge(detail.post.version)}<span>{detail.post.title}</span></span></h2></div><div className="public-board-toolbar"><button className="btn" type="button" onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)}>{TEXT.back}</button></div></div>
                    <div className="public-comment-meta public-detail-meta">
                      {detail.post.category ? <span className="public-detail-cat">{detail.post.category}</span> : null}
                      <span className="public-detail-author">{renderAuthor(detail.post.author_name, detail.post.is_staff_author, detail.post.has_enhanced_stone)}</span>
                      <span>{formatDate(detail.post.created_at)}</span>
                      <span>조회 {Number(detail.post.views || 0).toLocaleString()}</span>
                      <span>댓글 {comments.length}</span>
                    </div>
                    <article className={`public-post-content${isUpdateBoard ? ' public-update-content' : ''}`} dangerouslySetInnerHTML={{ __html: isUpdateBoard ? sanitizeHtml(decorateUpdateContent(detail.post.content || '')) : sanitizeHtml(detail.post.content || '') }} />
                    {isPromotionBoard && asArray(detail.post.promotion_urls).length ? (
                      <div className="public-promotion-links"><h3>등록된 홍보 URL</h3><ul>{detail.post.promotion_urls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></div>
                    ) : null}
                    <div className="public-post-write-actions public-detail-actions">
                      <button className="btn" type="button" onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)}>목록</button>
                      {canEditOwner(detail.post, user) ? (
                        <>
                          <button className="btn" type="button" onClick={beginEdit}>수정하기</button>
                          <button className="btn" type="button" onClick={copyPostUrl}>주소복사</button>
                          <button className="btn btn-danger" type="button" onClick={deletePost}>삭제하기</button>
                        </>
                      ) : null}
                    </div>

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
                    <div className="public-board-head public-write-head"><div><h2>{currentBoard.name} 글 작성</h2><p className="public-board-sub">대표 캐릭터가 있는 계정만 작성 가능합니다.</p></div><div className="public-board-toolbar"><button className="btn" type="button" onClick={() => navigate(`/?board=${encodeURIComponent(currentBoard.id)}`)}>{TEXT.back}</button></div></div>
                    <div className="public-post-write-card">
                      <div className="public-write-field">
                        <label className="public-write-label">제목</label>
                        <input className="public-board-text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TEXT.titlePlaceholder} />
                      </div>
                      {isSupportBoard ? <><InquiryFields mode={isBugReportBoard ? 'bugreport' : 'inquiry'} category={inquiryCategory} onCategoryChange={setInquiryCategory} sponsorAgree={sponsorAgree} onSponsorAgreeChange={setSponsorAgree} sponsorName={sponsorName} onSponsorNameChange={setSponsorName} sponsorAmount={sponsorAmount} onSponsorAmountChange={setSponsorAmount} /><RichEditor value={content} onChange={setContent} onAlert={showAlert} allowHtml={isAdmin(user)} /></> : null}
                      {isPromotionBoard ? <><PromotionFields urls={promotionUrls} onChange={updatePromotionUrl} onAdd={addPromotionUrl} onRemove={removePromotionUrl} /><RichEditor value={content} onChange={setContent} onAlert={showAlert} allowHtml={isAdmin(user)} /></> : null}
                      {!isSupportBoard && !isPromotionBoard ? (
                        <>
                          {isUpdateBoard ? (
                            <div className="public-update-template-bar">
                              <span className="public-update-template-label">📋 업데이트 양식 (신규 · 개선 · 수정)</span>
                              <button type="button" className="btn btn-small" onClick={loadUpdateTemplate}>양식 불러오기</button>
                            </div>
                          ) : null}
                          <RichEditor value={content} onChange={setContent} onAlert={showAlert} allowHtml={isAdmin(user)} />
                        </>
                      ) : null}
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
          <div className="footer-brand-block">
            <div className="footer-brand"><span aria-hidden="true">♜</span> Karazhan</div>
            <small>© 2026 Karazhan Server. All rights reserved.</small>
          </div>
          <div className="footer-links">
            <button type="button" className="button-reset footer-link-button" onClick={openServerRules}>개인정보처리방침</button>
            <button type="button" className="button-reset footer-link-button" onClick={openServerRules}>이용약관</button>
            <button type="button" className="button-reset footer-link-button" onClick={() => openBoard(visibleBoards.find((board) => board.name.includes('문의'))?.id || visibleBoards[0]?.id)}>문의하기</button>
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

