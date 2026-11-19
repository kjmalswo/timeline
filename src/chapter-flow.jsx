import { memo } from 'react'
import { EditorContent } from '@tiptap/react'
import { generateHTML } from '@tiptap/core'
import { writingExtensions } from './document.js'
import { chapterLabel, chapterName, headingStyle } from './chapter-heading.js'

export const FormattedChapter = memo(function FormattedChapter({ content }) {
  return <div className="paper-body chapter-body" dangerouslySetInnerHTML={{ __html: generateHTML(content, writingExtensions) }} />
})

export function ChapterFlow({ book, activeId, editor, onSelect, single, children }) {
  return book.chapters.map((chapter, index) => {
    const active = chapter.id === activeId
    const label = chapterLabel(chapter, index)
    return <section className={single ? 'chapter-entry paper-article' : 'chapter-entry'} key={chapter.id}>
      {label || chapter.title ? <div className="chapter-heading" data-current-chapter={active ? '' : undefined}>
        {label && (active || chapter.title
          ? <span className="chapter-kicker" style={headingStyle(chapter.heading?.labelStyle)}>{label}</span>
          : <button type="button" className="chapter-kicker chapter-switch" style={headingStyle(chapter.heading?.labelStyle)}
            onClick={() => onSelect(chapter.id)} title={chapterName(chapter, index) + ' 편집'}>{label}</button>)}
        {active ? children : chapter.title && <button type="button" className="editor-chapter-title chapter-switch" style={headingStyle(chapter.heading?.titleStyle)}
          onClick={() => onSelect(chapter.id)} title={chapter.title + ' 편집'}>{chapter.title}</button>}
      </div> : active && <div className="chapter-start" data-current-chapter="" aria-hidden="true" />}
      {active ? <EditorContent className="paper-body chapter-body" editor={editor} /> : <FormattedChapter content={chapter.content} />}
    </section>
  })
}
