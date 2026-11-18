import { makeDocument, TEMPLATES } from './catalog.js'

const samples = [
  {
    title: '새벽의 문장들', template: 'essay', createdDaysAgo: 0, active: 1,
    chapters: [
      ['아직 아무도 깨어나지 않은 시간',
        '새벽에는 세상이 잠시 멈춘 것 같다. 창문 너머 아파트의 불빛이 하나씩 꺼지고 나면 나는 빈 문서를 열어 둔다.',
        '잘 쓰기 위해서가 아니라, 오늘 하루가 흩어지기 전에 무언가를 붙들어 두기 위해서다.'],
      ['아침이 오기 전에',
        '아침이 오기 전, 하늘은 몇 번이나 색을 바꾼다. 어둠과 빛 사이, 이름 붙이기 어려운 그 빛을 나는 좋아한다.',
        '부엌에서 물이 끓는 소리를 들으면서 어제의 마지막 문장을 다시 읽었다. 나에게 필요했던 것은 새로운 이야기가 아니라, 이미 아는 이야기를 조금 다른 눈으로 바라보는 일이었다.',
        '어쩌면 쓴다는 것은 끝을 정해 두지 않고 한 걸음 더 걸어보는 일인지도 모른다.'],
    ],
  },
  {
    title: '초록의 방향', template: 'novel', createdDaysAgo: 2, active: 0,
    chapters: [
      ['숲의 입구',
        '그해 여름, 지우는 버스가 서지 않는 정류장에서 내렸다. 오래된 이정표의 화살표는 작은 숲을 향하고 있었다.',
        '멀리서 비 냄새가 났다. 지우는 접어 둔 지도를 가방 깊숙이 넣고 그늘 속으로 걸었다.'],
      ['지도에 없는 길', '한낮인데도 길은 조용했다. 발걸음마다 마른 잎이 부스러졌다.'],
    ],
  },
  {
    title: '우리가 지나온 계절', template: 'poetry', createdDaysAgo: 5, active: 0,
    chapters: [
      ['봄과 여름 사이', '문을 열자\n빗소리가 먼저 들어왔다.',
        '어제의 계절을\n우리는 그렇게 건너왔다.'],
    ],
  },
]

export function sampleBooks() {
  return samples.map((sample, index) => {
    const id = '77e00000-0000-4000-8000-00000000000' + (index + 1)
    const chapters = sample.chapters.map(([title, ...lines], chapterIndex) => ({
      id: '77e0000' + (index + 1) + '-0000-4000-8000-00000000000' + (chapterIndex + 1),
      title,
      content: makeDocument(...lines.flatMap(line => line.split('\n'))),
    }))
    const template = TEMPLATES[sample.template]
    return {
      id, title: sample.title, template: sample.template, cover: template.cover, chapters,
      layout: structuredClone(template.layout), activeChapterId: chapters[sample.active].id,
      favorite: index === 0, status: index === 2 ? 'complete' : 'draft', trashed: false,
      cursor: null, revision: 0, updatedAt: new Date(Date.now() - (sample.createdDaysAgo * 24 * 60 + 18) * 60_000).toISOString(),
    }
  })
}
