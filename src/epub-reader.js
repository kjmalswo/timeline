import { strFromU8, unzipSync } from 'fflate'
import { TEMPLATES } from './catalog.js'

const megabyte = 1024 * 1024
const archiveOrigin = 'https://epub.invalid'
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const contentTags = new Set(['article', 'aside', 'blockquote', 'br', 'caption', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'section', 'small', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'b'])
const ignoredTags = new Set(['applet', 'audio', 'button', 'embed', 'form', 'head', 'iframe', 'link', 'meta', 'nav', 'noscript', 'object',
  'script', 'style', 'svg', 'template', 'title', 'video'])
const textStyles = {
  textAlign: /^(left|right|center|justify|start|end)$/,
  fontSize: /^(?:\d|[1-4]\d)(?:\.\d{1,2})?(?:pt|px)$/,
  fontWeight: /^(normal|bold|[1-9]\d{2})$/,
  fontStyle: /^(normal|italic|oblique)$/,
  fontFamily: /^[\p{L}\d ,"'-]{1,140}$/u,
  color: /^(?:#[\da-f]{3,8}|(?:rgb|rgba)\([\d.,% /]+\))$/i,
  lineHeight: /^[1-3](?:\.\d{1,2})?$/,
  textIndent: /^\d(?:\.\d{1,2})?em$/,
  letterSpacing: /^-?0(?:\.\d{1,3})?em$/,
  marginInlineStart: /^\d(?:\.\d{1,2})?em$/,
  marginBottom: /^(?:[0-2](?:\.\d{1,2})?|3(?:\.0{1,2})?)em$/,
}

function archivePath(href, directoryFile = '') {
  if (!href || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return null
  try {
    const base = directoryFile.split('/').map(encodeURIComponent).join('/')
    const path = new URL(href, archiveOrigin + '/' + base)
    return path.origin === archiveOrigin ? decodeURIComponent(path.pathname.slice(1)) : null
  } catch {
    return null
  }
}

function parsePackage(bytes) {
  if (!bytes) throw new Error('EPUB 파일에서 책 정보를 찾지 못했어요.')
  const markup = strFromU8(bytes)
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(markup)) throw new Error('이 EPUB의 책 정보 형식을 읽을 수 없어요.')
  const xml = new DOMParser().parseFromString(markup, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('EPUB의 책 정보가 손상됐어요.')
  return xml
}

function elements(root, name) {
  return Array.from(root.getElementsByTagNameNS('*', name))
}

function inertHtml(bytes) {
  const template = document.createElement('template')
  template.innerHTML = strFromU8(bytes)
  return template.content
}

function base64(data) {
  if (data.toBase64) return data.toBase64()
  let binary = ''
  for (let start = 0; start < data.length; start += 16384) binary += String.fromCharCode(...data.subarray(start, start + 16384))
  return btoa(binary)
}

function rewriteContent(source, resolveImage) {
  const result = document.createElement('div')

  function copy(sourceNode, target, depth = 0) {
    if (sourceNode.nodeType === 3) target.appendChild(document.createTextNode(sourceNode.nodeValue))
    if (sourceNode.nodeType !== 1 || depth >= 80) return
    const name = sourceNode.localName.toLowerCase()
    if (ignoredTags.has(name)) return
    if (name === 'img') {
      const src = resolveImage(sourceNode.getAttribute('src'))
      if (src) {
        const img = document.createElement('img')
        img.setAttribute('src', src)
        img.setAttribute('alt', (sourceNode.getAttribute('alt') ?? '').slice(0, 500))
        target.append(img)
      }
      return
    }
    let next = target
    if (contentTags.has(name)) {
      next = document.createElement(name)
      const sourceStyle = sourceNode.style
      for (const [property, rule] of Object.entries(textStyles)) {
        if (rule.test(sourceStyle?.[property] ?? '')) next.style[property] = sourceStyle[property]
      }
      for (const className of ['chapter-kicker', 'chapter-display-title']) {
        if (sourceNode.classList.contains(className)) next.classList.add(className)
      }
      if (name === 'figure') {
        if (/^(?:[1-9]\d?|100)%$/.test(sourceStyle?.width ?? '')) next.style.width = sourceStyle.width
        const align = sourceNode.getAttribute('data-align')
        if (['left', 'center', 'right'].includes(align)) next.setAttribute('data-align', align)
      }
      if (name === 'ol' && /^\d{1,6}$/.test(sourceNode.getAttribute('start') ?? '')) next.setAttribute('start', sourceNode.getAttribute('start'))
      target.append(next)
    }
    for (const child of sourceNode.childNodes) copy(child, next, depth + 1)
  }

  for (const child of source.childNodes) copy(child, result)
  return result
}

export async function readEpub(file) {
  if (!/\.epub$/i.test(file.name)) throw new Error('EPUB 파일을 선택해 주세요.')
  if (file.size > 24 * megabyte) throw new Error('24MB 이하의 EPUB 파일을 선택해 주세요.')
  let fileCount = 0
  let total = 0
  let files
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        if (++fileCount > 2500) throw new Error()
        if (entry.name !== 'mimetype' && !/\.(?:xml|opf|ncx|x?html?|jpe?g|png|gif|webp)$/i.test(entry.name)) return false
        total += entry.originalSize
        if (entry.originalSize > 12 * megabyte || total > 60 * megabyte) throw new Error()
        return true
      },
    })
  } catch {
    throw new Error('EPUB 파일을 열 수 없어요. 파일 형식과 크기를 확인해 주세요.')
  }
  if (!files.mimetype || strFromU8(files.mimetype).trim() !== 'application/epub+zip') throw new Error('올바른 EPUB 파일을 선택해 주세요.')
  const container = parsePackage(files['META-INF/container.xml'])
  const packagePath = archivePath(elements(container, 'rootfile')[0]?.getAttribute('full-path'))
  const opf = parsePackage(files[packagePath])
  const title = elements(opf, 'title')[0]?.textContent.trim().slice(0, 200) || file.name.replace(/\.epub$/i, '')
  const author = elements(opf, 'creator')[0]?.textContent.trim().slice(0, 200) || ''
  const items = elements(opf, 'item').map(item => ({
    id: item.getAttribute('id'), path: archivePath(item.getAttribute('href'), packagePath), type: item.getAttribute('media-type'),
    properties: (item.getAttribute('properties') ?? '').split(/\s+/),
  }))
  const byId = new Map(items.map(item => [item.id, item]))
  const byPath = new Map(items.map(item => [item.path, item]))
  const assets = new Map()

  function imageSource(path) {
    const type = byPath.get(path)?.type
    if (!imageTypes.has(type) || !Object.hasOwn(files, path)) return null
    if (!assets.has(path)) assets.set(path, `data:${type};base64,${base64(files[path])}`)
    return assets.get(path)
  }

  const coverId = elements(opf, 'meta').find(meta => meta.getAttribute('name') === 'cover')?.getAttribute('content')
  const coverItem = items.find(item => item.properties.includes('cover-image')) ?? byId.get(coverId)
  const coverImage = imageSource(coverItem?.path)
  const toc = new Map()
  const nav = items.find(item => item.properties.includes('nav'))
  if (nav && files[nav.path]) {
    const navigation = inertHtml(files[nav.path])
    const menu = Array.from(navigation.querySelectorAll('nav')).find(node => node.getAttribute('epub:type') === 'toc')
      ?? navigation.querySelector('nav')
    for (const link of menu?.querySelectorAll('a[href]') ?? []) {
      const path = archivePath(link.getAttribute('href'), nav.path)
      if (path && !toc.has(path)) toc.set(path, link.textContent.trim())
    }
  }
  const spine = elements(opf, 'itemref').filter(item => item.getAttribute('linear') !== 'no')
  if (spine.length > 600) throw new Error('EPUB의 장 수가 너무 많아요.')
  const chapters = []
  const visited = new Set()
  for (const entry of spine) {
    const item = byId.get(entry.getAttribute('idref'))
    if (!item || !files[item.path] || item === nav || visited.has(item.path) || !['application/xhtml+xml', 'text/html'].includes(item.type)) continue
    visited.add(item.path)
    const content = rewriteContent(inertHtml(files[item.path]), href => imageSource(archivePath(href, item.path)))
    const images = content.querySelectorAll('img')
    const text = content.textContent.trim()
    if (!text && (!images.length || (images.length === 1 && images[0].getAttribute('src') === coverImage))) continue
    const heading = content.querySelector('h1,h2,h3')?.textContent.trim()
    chapters.push({ id: item.path, title: (toc.get(item.path) || heading || `제 ${chapters.length + 1}장`).slice(0, 200), html: content.innerHTML })
  }
  if (!chapters.length) throw new Error('EPUB 안에서 읽을 수 있는 본문을 찾지 못했어요.')
  return { title, author, layout: TEMPLATES.novel.layout, cover: 'ivory', coverImage, chapters, imported: true }
}
