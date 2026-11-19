import { generateHTML } from '@tiptap/core'
import { strToU8, zipSync } from 'fflate'
import { FONTS } from './catalog.js'
import { chapterLabel, chapterName, headingDefaults, headingStyle } from './chapter-heading.js'
import { coverAuthor } from './cover-model.js'
import { DEFAULT_ALIGNMENT, writingExtensions } from './document.js'
import { ebookCover, ebookPhoto } from './ebook-images.js'

const epubType = 'application/epub+zip'
const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n'
const invalidXml = /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu
const xmlChars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const xml = value => value.replace(invalidXml, '\ufffd').replace(/[&<>"]/g, character => xmlChars[character])

function xhtml(title, content) {
  return `${xmlDeclaration}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko">
<head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="book.css"/></head>
<body>${content}</body></html>`
}

function stylesheet(layout) {
  return `body { font-family: ${FONTS[layout.font].family}; font-size: ${layout.fontSize}pt; line-height: ${layout.lineHeight}; }
.paper-body { text-align: ${DEFAULT_ALIGNMENT}; overflow-wrap: anywhere; }
.paper-body p { margin: 0 0 .68em; text-indent: ${layout.firstLine}em; }
.paper-body li p { text-indent: 0; margin-bottom: .22em; }
.paper-body p[style*='text-align: center'], .paper-body p[style*='text-align: right'] { text-indent: 0; }
.chapter-kicker { display: block; font-size: ${headingDefaults.labelStyle.fontSize}pt; color: ${headingDefaults.labelStyle.color}; font-weight: bold; }
.chapter-kicker:only-child { margin-bottom: 1.2em; }
.chapter-display-title { font-size: ${headingDefaults.titleStyle.fontSize}pt; font-weight: bold; margin: .3em 0 .9em; }
blockquote { margin: .65em 0; padding-left: .76em; border-left: .16em solid #ddd; }
figure { margin: .75em auto; break-inside: avoid; }
figure[data-align='left'] { margin-left: 0; } figure[data-align='right'] { margin-right: 0; }
img { display: block; max-width: 100%; height: auto; }
figure img { width: 100%; }
.cover img { margin: auto; }`
}

function chapterHeader(chapter, index, serializer) {
  const header = document.createElement('header')
  const lines = [
    ['span', 'chapter-kicker', chapterLabel(chapter, index), chapter.heading?.labelStyle],
    ['h1', 'chapter-display-title', chapter.title, chapter.heading?.titleStyle],
  ]
  for (const [tag, className, text, settings] of lines) {
    if (!text) continue
    const element = document.createElement(tag)
    element.className = className
    element.textContent = text
    for (const [key, value] of Object.entries(headingStyle(settings))) if (value !== undefined) element.style[key] = value
    header.append(element)
  }
  return header.childElementCount ? serializer.serializeToString(header).replace(invalidXml, '\ufffd') : ''
}

async function chapterMarkup(chapter, index, imagePath) {
  const body = document.createElement('div')
  body.className = 'paper-body'
  body.innerHTML = generateHTML(chapter.content, writingExtensions)
  for (const image of body.querySelectorAll('img')) {
    image.setAttribute('src', await imagePath(image.getAttribute('src')))
    image.removeAttribute('draggable')
    const figure = image.closest('figure')
    if (figure) figure.style.width = figure.dataset.width + '%'
  }
  const serializer = new XMLSerializer()
  const content = serializer.serializeToString(body).replace(invalidXml, '\ufffd')
  return xhtml(chapterName(chapter, index), `<section epub:type="chapter">${chapterHeader(chapter, index, serializer)}${content}</section>`)
}

export async function createEpub(book) {
  const files = {
    mimetype: [strToU8(epubType), { level: 0 }],
    'META-INF/container.xml': strToU8(`${xmlDeclaration}<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
  }
  const manifest = []
  const spine = []
  function add(id, path, type, contents, { properties, readable } = {}) {
    files['EPUB/' + path] = typeof contents === 'string' ? strToU8(contents) : [contents, { level: 0 }]
    manifest.push(`<item id="${id}" href="${path}" media-type="${type}"${properties ? ` properties="${properties}"` : ''}/>`)
    if (readable) spine.push(`<itemref idref="${id}"/>`)
  }

  const xhtmlType = 'application/xhtml+xml'
  add('style', 'book.css', 'text/css', stylesheet(book.layout))
  add('cover-image', 'cover.jpg', 'image/jpeg', await ebookCover(book), { properties: 'cover-image' })
  add('cover', 'cover.xhtml', xhtmlType, xhtml(book.title,
    `<section epub:type="cover" class="cover"><img src="cover.jpg" alt="${xml(book.title)} 표지"/></section>`), { readable: true })
  const links = book.chapters.map((chapter, index) => `<li><a href="chapter-${index + 1}.xhtml">${xml(chapterName(chapter, index))}</a></li>`)
  add('nav', 'nav.xhtml', xhtmlType, xhtml('목차', `<nav epub:type="toc" id="toc"><h1>목차</h1><ol>${links.join('')}</ol></nav>`),
    { properties: 'nav', readable: true })

  const imagePaths = new Map()
  async function imagePath(source) {
    if (imagePaths.has(source)) return imagePaths.get(source)
    const { type, bytes } = await ebookPhoto(source)
    const id = 'photo-' + (imagePaths.size + 1)
    const path = id + (type === 'image/jpeg' ? '.jpg' : '.png')
    add(id, path, type, bytes)
    imagePaths.set(source, path)
    return path
  }

  for (const [index, chapter] of book.chapters.entries()) {
    const id = 'chapter-' + (index + 1)
    add(id, id + '.xhtml', xhtmlType, await chapterMarkup(chapter, index, imagePath), { readable: true })
  }
  const author = coverAuthor(book) || book.spine?.author.trim()
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  files['EPUB/book.opf'] = strToU8(`${xmlDeclaration}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="ko">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${xml(book.id)}</dc:identifier><dc:title>${xml(book.title)}</dc:title><dc:language>ko</dc:language>
${author ? `<dc:creator>${xml(author)}</dc:creator>` : ''}<meta property="dcterms:modified">${modified}</meta>
</metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`)
  return zipSync(files)
}

export async function downloadEpub(book) {
  const bytes = await createEpub(book)
  const url = URL.createObjectURL(new Blob([bytes], { type: epubType }))
  const link = document.createElement('a')
  link.href = url
  link.download = (book.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120).trim() || '원고') + '.epub'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
