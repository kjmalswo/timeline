import { FONTS, PAPERS } from './catalog.js'

function StrokeLayer({ layer, paper }) {
  const height = 1000 * paper.height / paper.width
  return (
    <svg className="cover-ink" viewBox={'0 0 1000 ' + height} aria-hidden="true">
      {layer.strokes.map((stroke, index) => {
        const [[x, y]] = stroke.points
        const points = stroke.points.map(([left, top]) => [left * 10, top * height / 100].join(',')).join(' ')
        return stroke.points.length === 1
          ? <circle key={index} cx={x * 10} cy={y * height / 100} r={stroke.size / 2} fill={stroke.color} />
          : <polyline key={index} points={points} fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />
      })}
    </svg>
  )
}

export function CoverArtwork({ book, design = book.coverDesign, activeId, children, ...surfaceProps }) {
  const paper = PAPERS[book.layout.paper]
  const background = design.background
  return (
    <span {...surfaceProps} className={'cover-artwork' + (background ? '' : ' artwork-' + book.cover)}
      style={{ '--cover-ratio': paper.width / paper.height, backgroundColor: background ?? undefined }}>
      {design.layers.map(layer => {
        if (layer.type === 'ink') return <StrokeLayer key={layer.id} layer={layer} paper={paper} />
        const active = layer.id === activeId
        return (
          <span key={layer.id} className={'cover-object cover-object-' + layer.type + (active ? ' cover-object-selected' : '')}
            data-cover-layer={layer.id} style={{
              left: layer.x + '%', top: layer.y + '%', width: layer.w + '%',
              ...(layer.type === 'photo' ? { height: layer.h + '%' } : {}),
              transform: 'rotate(' + layer.angle + 'deg)',
            }}>
            {layer.type === 'photo'
              ? <img src={layer.src} alt={layer.alt} draggable={false} style={{
                objectFit: layer.fit, objectPosition: layer.cropX + '% ' + layer.cropY + '%',
                filter: 'brightness(' + layer.brightness + ')',
                opacity: layer.opacity, transform: layer.flip ? 'scaleX(-1)' : undefined,
              }} />
              : <span className="cover-lettering" style={{
                fontFamily: FONTS[layer.font].family, fontSize: layer.size + 'cqw', fontWeight: layer.bold ? 760 : 500,
                color: layer.color, textAlign: layer.align, opacity: layer.opacity,
              }}>{layer.text || (active ? (layer.role === 'author' ? '저자명' : '제목') : '')}</span>}
            {active && <span className="cover-size-handle" data-cover-handle="resize" aria-hidden="true" />}
          </span>
        )
      })}
      {children}
    </span>
  )
}
