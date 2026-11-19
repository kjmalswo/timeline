export const PAPERS = {
  b6: { name: '46판 · 문학', width: 128, height: 188 },
  a5: { name: '국판 · A5', width: 148, height: 210 },
  shin: { name: '신국판 · 단행본', width: 152, height: 225 },
  tall: { name: '변형판 · 시집', width: 110, height: 180 },
  a4: { name: 'A4 · 원고', width: 210, height: 297 },
}

export const FONTS = {
  serif: { name: '노토 세리프', family: '"Noto Serif KR Variable", serif' },
  sans: { name: '노토 산스', family: '"Noto Sans KR Variable", sans-serif' },
  batang: { name: '바탕', family: 'Batang, "Noto Serif KR Variable", serif' },
  book: { name: '조지아', family: 'Georgia, "Noto Serif KR Variable", serif' },
}

export const COVERS = {
  dawn: { name: '보랏빛 새벽', ink: '#fff9fb', base: '#59426e' },
  grove: { name: '초록의 숲', ink: '#fffcef', base: '#425b42' },
  season: { name: '따뜻한 노을', ink: '#482c2a', base: '#f1bdad' },
  ivory: { name: '아이보리', ink: '#583d56', base: '#f9edda' },
}

export const TEMPLATES = {
  essay: {
    name: '에세이', description: '여백을 살린 차분한 산문', icon: 'feather', cover: 'dawn',
    layout: { paper: 'b6', font: 'serif', fontSize: 11, lineHeight: 1.85, firstLine: 1, margins: { top: 23, right: 17, bottom: 21, left: 17 } },
  },
  novel: {
    name: '소설', description: '몰입을 돕는 고전적인 본문', icon: 'book', cover: 'grove',
    layout: { paper: 'b6', font: 'serif', fontSize: 10.5, lineHeight: 1.75, firstLine: 1, margins: { top: 21, right: 17, bottom: 21, left: 17 } },
  },
  poetry: {
    name: '시집', description: '시의 호흡을 위한 넉넉한 여백', icon: 'sparkles', cover: 'season',
    layout: { paper: 'tall', font: 'serif', fontSize: 11, lineHeight: 2, firstLine: 0, margins: { top: 28, right: 16, bottom: 25, left: 16 } },
  },
  nonfiction: {
    name: '논픽션', description: '목차와 소제목에 어울리는 구성', icon: 'layers', cover: 'ivory',
    layout: { paper: 'shin', font: 'sans', fontSize: 11, lineHeight: 1.65, firstLine: 0, margins: { top: 23, right: 19, bottom: 23, left: 19 } },
  },
}

export const STATUSES = { draft: '집필 중', complete: '초고 완료' }

export function newId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

export function makeDocument(...paragraphs) {
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map(text =>
      text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
    ),
  }
}

export function newChapter(title) {
  return { id: newId(), title, content: makeDocument() }
}

export function newBook({ title, template, cover, paper }) {
  const chapter = newChapter('제목 없는 장')
  return {
    id: newId(), title, template, cover,
    layout: { ...structuredClone(TEMPLATES[template].layout), paper },
    chapters: [chapter], activeChapterId: chapter.id, cursor: null,
    status: 'draft', favorite: false, trashed: false,
    revision: 0, updatedAt: new Date().toISOString(),
  }
}

export function documentText(document) {
  if (!document) return ''
  if (document.type === 'text') return document.text ?? ''
  return (document.content ?? []).map(documentText).join(document.type === 'doc' ? '\n' : '')
}

export function characterCount(document, includeSpaces = false) {
  const value = documentText(document)
  return Array.from(includeSpaces ? value : value.replace(/\s/g, '')).length
}

export function bookCharacters(book) {
  return book.chapters.reduce((total, { content }) => total + characterCount(content), 0)
}

export function relativeDate(timestamp) {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime())
  if (elapsed < 60_000) return '방금 전'
  if (elapsed < 3_600_000) return Math.floor(elapsed / 60_000) + '분 전'
  if (elapsed < 86_400_000) return Math.floor(elapsed / 3_600_000) + '시간 전'
  if (elapsed < 604_800_000) return Math.floor(elapsed / 86_400_000) + '일 전'
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(timestamp))
}
