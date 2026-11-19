import { COVERS, FONTS, PAPERS } from './catalog.js'
import { frontDesign } from './cover-model.js'

async function loadImage(source) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

function canvasFor(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function encode(canvas, type) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92))
  if (!blob) throw new Error('전자책 이미지를 만들 수 없습니다.')
  return new Uint8Array(await blob.arrayBuffer())
}

function drawPhoto(context, image, width, height, fit, cropX = 50, cropY = 50) {
  const horizontal = width / image.naturalWidth
  const vertical = height / image.naturalHeight
  const scale = fit === 'contain' ? Math.min(horizontal, vertical) : Math.max(horizontal, vertical)
  const w = image.naturalWidth * scale
  const h = image.naturalHeight * scale
  context.beginPath()
  context.rect(0, 0, width, height)
  context.clip()
  context.drawImage(image, (width - w) * cropX / 100, (height - h) * cropY / 100, w, h)
}

function drawStrokes(context, strokes, width, height) {
  for (const stroke of strokes) {
    const points = stroke.points.map(([x, y]) => [x * width / 100, y * height / 100])
    const [[x, y]] = points
    context.beginPath()
    if (points.length === 1) {
      context.arc(x, y, stroke.size / 2, 0, Math.PI * 2)
      context.fillStyle = stroke.color
      context.fill()
    } else {
      context.moveTo(x, y)
      for (const point of points.slice(1)) context.lineTo(...point)
      context.strokeStyle = stroke.color
      context.lineWidth = stroke.size
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke()
    }
  }
}

function textLines(context, text, width) {
  return text.split(/\r?\n/).flatMap(paragraph => {
    const lines = []
    let line = ''
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > width) {
        lines.push(line)
        line = ''
      }
      line += character
    }
    return [...lines, line]
  })
}

async function drawText(context, layer, x, y, width, coverWidth) {
  const size = layer.size * coverWidth / 100
  context.font = `${layer.bold ? 760 : 500} ${size}px ${FONTS[layer.font].family}`
  await document.fonts.load(context.font, layer.text).catch(() => {})
  const lines = textLines(context, layer.text, width)
  const lineHeight = size * 1.23
  const height = lines.length * lineHeight
  context.translate(x + width / 2, y + height / 2)
  context.rotate(layer.angle * Math.PI / 180)
  context.textBaseline = 'middle'
  context.textAlign = layer.align
  context.fillStyle = layer.color
  const origin = { left: -width / 2, center: 0, right: width / 2 }[layer.align]
  lines.forEach((line, index) => context.fillText(line, origin, (index + 0.5) * lineHeight - height / 2))
}

export async function ebookCover(book) {
  const paper = PAPERS[book.layout.paper]
  const width = 1000
  const height = Math.round(width * paper.height / paper.width)
  const design = frontDesign(book)
  const canvas = canvasFor(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = design.background ?? COVERS[book.cover].base
  context.fillRect(0, 0, width, height)
  if (!design.background && book.cover !== 'ivory') {
    context.save()
    drawPhoto(context, await loadImage('/art/' + book.cover + '.webp'), width, height, 'cover')
    context.restore()
  }
  for (const layer of design.layers) {
    context.save()
    if (layer.type === 'ink') drawStrokes(context, layer.strokes, width, height)
    else {
      const w = layer.w * width / 100
      const x = layer.x * width / 100
      const y = layer.y * height / 100
      context.globalAlpha = layer.opacity
      if (layer.type === 'text') await drawText(context, layer, x, y, w, width)
      else {
        const h = layer.h * height / 100
        context.translate(x + w / 2, y + h / 2)
        context.rotate(layer.angle * Math.PI / 180)
        if (layer.flip) context.scale(-1, 1)
        context.translate(-w / 2, -h / 2)
        context.filter = `brightness(${layer.brightness})`
        drawPhoto(context, await loadImage(layer.src), w, h, layer.fit, layer.cropX, layer.cropY)
      }
    }
    context.restore()
  }
  return encode(canvas, 'image/jpeg')
}

export async function ebookPhoto(source) {
  const [header, data] = source.split(',')
  const type = header.slice(5, -7)
  if (type !== 'image/webp') return { type, bytes: Uint8Array.from(atob(data), character => character.charCodeAt(0)) }
  const image = await loadImage(source)
  const canvas = canvasFor(image.naturalWidth, image.naturalHeight)
  canvas.getContext('2d').drawImage(image, 0, 0)
  return { type: 'image/png', bytes: await encode(canvas, 'image/png') }
}
