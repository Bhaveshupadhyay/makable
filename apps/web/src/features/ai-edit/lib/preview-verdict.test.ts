import { expect, test } from 'bun:test'
import { type PreviewStatus, previewVerdict } from './preview-verdict'

const TIMING = { startMs: 30, loadMs: 200, settleMs: 20 }

/** A fake preview: the current state, and a way to move it. */
function fakePreview(initial: PreviewStatus) {
  let state = initial
  const listeners = new Set<(s: PreviewStatus) => void>()
  return {
    subscribe: (listener: (s: PreviewStatus) => void) => {
      listeners.add(listener)
      listener(state)
      return () => void listeners.delete(listener)
    },
    set: (next: PreviewStatus) => {
      state = next
      listeners.forEach((l) => l(next))
    },
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ERROR: PreviewStatus = { status: 'error', error: { title: 'SyntaxError', message: 'Unexpected token', path: '/src/App.tsx', line: 4 } }

test('a reload that ends ready is fine', async () => {
  const preview = fakePreview({ status: 'ready' })
  const verdict = previewVerdict(preview.subscribe, TIMING)
  preview.set({ status: 'loading' })
  preview.set({ status: 'ready' })

  expect(await verdict).toEqual({ ok: true })
})

test('an error after the reload is reported with its place in the code', async () => {
  const preview = fakePreview({ status: 'ready' })
  const verdict = previewVerdict(preview.subscribe, TIMING)
  preview.set({ status: 'loading' })
  preview.set({ status: 'ready' })
  await wait(5)
  preview.set(ERROR)

  expect(await verdict).toEqual({ ok: false, error: { message: 'SyntaxError: Unexpected token', path: 'src/App.tsx', line: 4 } })
})

test("the state before the change doesn't count while a reload is coming", async () => {
  const preview = fakePreview(ERROR)
  const verdict = previewVerdict(preview.subscribe, TIMING)
  await wait(10)
  preview.set({ status: 'loading' })
  preview.set({ status: 'ready' })

  expect(await verdict).toEqual({ ok: true })
})

test('without a reload, the state at the end of the wait counts', async () => {
  expect(await previewVerdict(fakePreview({ status: 'ready' }).subscribe, TIMING)).toEqual({ ok: true })
  expect((await previewVerdict(fakePreview(ERROR).subscribe, TIMING)).ok).toBe(false)
})
