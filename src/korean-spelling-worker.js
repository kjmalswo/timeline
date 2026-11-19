import { Hunspell } from 'hunspell-wasm'
import initialize from 'hunspell-wasm/wasm/hunspell.js'
import wasmUrl from 'hunspell-wasm/wasm/hunspell.wasm?url'
import affixUrl from '@korean-dictionary/index.aff?url'
import dictionaryUrl from '@korean-dictionary/index.dic?url'

async function loadFile(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error('Could not load spelling asset')
  return new Uint8Array(await response.arrayBuffer())
}

const checker = Promise.all([loadFile(wasmUrl), loadFile(affixUrl), loadFile(dictionaryUrl)])
  .then(async ([wasmBinary, affixes, dictionary]) => new Hunspell(await initialize({ wasmBinary }), affixes, dictionary))
  .catch(() => null)

self.addEventListener('message', async ({ data: { id, words } }) => {
  const spell = await checker
  try {
    if (!spell) throw new Error('Could not load the Korean dictionary')
    self.postMessage({ id, misspelled: words.filter(word => !spell.testSpelling(word)) })
  } catch {
    self.postMessage({ id, failed: true })
  }
})
