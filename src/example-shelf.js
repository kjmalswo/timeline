import { TEMPLATES } from './catalog.js'

const examples = [
  ['새벽의 문장들', 'essay', 0, 1, ['아직 아무도 깨어나지 않은 시간', '아침이 오기 전에']],
  ['초록의 방향', 'novel', 2, 0, ['숲의 입구', '지도에 없는 길']],
  ['우리가 지나온 계절', 'poetry', 5, 0, ['봄과 여름 사이']],
]

export function exampleShelf() {
  return examples.map(([title, template, daysAgo, active, titles], index) => {
    const id = '77e00000-0000-4000-8000-00000000000' + (index + 1)
    const chapters = titles.map((title, chapterIndex) => ({
      id: '77e0000' + (index + 1) + '-0000-4000-8000-00000000000' + (chapterIndex + 1), title,
    }))
    return {
      id, title, template, example: true, cover: TEMPLATES[template].cover, chapters, activeChapterId: chapters[active].id,
      favorite: false, status: index === 2 ? 'complete' : 'draft', trashed: false,
      cursor: null, revision: 0, updatedAt: new Date(Date.now() - (daysAgo * 24 * 60 + 18) * 60_000).toISOString(),
    }
  })
}
