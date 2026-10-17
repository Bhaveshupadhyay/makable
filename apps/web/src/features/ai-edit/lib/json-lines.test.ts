import { expect, test } from 'bun:test'
import { readJsonLines } from './json-lines'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

test('lines split across chunks are joined, and a last line without a newline still counts', async () => {
  const lines: unknown[] = []

  await readJsonLines(streamOf(['{"type":"pro', 'gress"}\n{"type":"ping"}\n\nnot json\n{"type":"res', 'ult"}']), (l) => lines.push(l))

  expect(lines).toEqual([{ type: 'progress' }, { type: 'ping' }, { type: 'result' }])
})
