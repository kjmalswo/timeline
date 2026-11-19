function separatePhrase([, before, leftGap, noun, rightGap, after]) {
  return before + (leftGap || ' ') + noun + (rightGap || ' ') + after
}

const rules = [
  [/(?<![\p{L}\p{N}])([가-힣]+)( *)(수(?:밖에|조차|는|도|가|만)?)( *)((?:있|없)[가-힣]*)(?![\p{L}\p{N}])/gu, match => {
    // The adnominal ending before the dependent noun 수 has a final ㄹ.
    return (match[1].charCodeAt(match[1].length - 1) - 0xac00) % 28 === 8 ? separatePhrase(match) : null
  }],
  [/(?<![\p{L}\p{N}])([가-힣]*(?:을|은|는|던|한|할|될|된|갈|올|볼))( *)(것)( *)(같[가-힣]*)(?![\p{L}\p{N}])/gu, separatePhrase],
  [/(것)(같[가-힣]*)(?![\p{L}\p{N}])/gu, ([, noun, after]) => `${noun} ${after}`],
  [/(?<![\p{L}\p{N}])([가-힣]*(?:을|할|갈|올|볼|될))(때(?:마다|까지|부터|에는|에|도|는|만)?)(?![\p{L}\p{N}])/gu,
    ([, before, after]) => `${before} ${after}`],
  [/뿐만아니라(?![\p{L}\p{N}])/gu, () => '뿐만 아니라'],
  [/(?<![\p{L}\p{N}])(?:안녕 +(?:하세요|하십니까)|감사 +합니다|오랜 +만(?:에|이다))(?![\p{L}\p{N}])/gu,
    ([word]) => word.replace(/ +/g, '')],
]

export function spacingCorrections(text) {
  const corrections = []
  for (const [pattern, correct] of rules) {
    for (const match of text.matchAll(pattern)) {
      const correction = correct(match)
      if (correction && correction !== match[0]) {
        corrections.push({ from: match.index, to: match.index + match[0].length, correction, spacing: true })
      }
    }
  }
  let end = 0
  return corrections.sort((a, b) => a.from - b.from || b.to - a.to).filter(correction => {
    if (correction.from < end) return false
    end = correction.to
    return true
  })
}
