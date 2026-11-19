import { memo } from 'react'
import { EditorContent } from '@tiptap/react'
import { generateHTML } from '@tiptap/core'
import { writingExtensions } from './document.js'

export const FormattedChapter = memo(function FormattedChapter({ content }) {
  return <div className="paper-body chapter-body" dangerouslySetInnerHTML={{ __html: generateHTML(content, writingExtensions) }} />
})

export function ChapterFlow({ book, activeId, editor, onSelect, children }) {
  return book.chapters.map((chapter, index) => {
    const active = chapter.id === activeId
    return <section className="chapter-entry" key={chapter.id}>
      <div className="chapter-heading" data-current-chapter={active ? '' : undefined}>
        <span className="chapter-kicker">제 {index + 1}장</span>
        {active ? children : <button type="button" className="editor-chapter-title chapter-switch"
          onClick={() => onSelect(chapter.id)} title={chapter.title + ' 편집'}>{chapter.title}</button>}
      </div>
      {active ? <EditorContent className="paper-body chapter-body" editor={editor} /> : <FormattedChapter content={chapter.content} />}
    </section>
  })
}
