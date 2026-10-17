/** Reads a stream of JSON lines (NDJSON), calling `onLine` with each parsed line. A line that isn't JSON is skipped. */
export async function readJsonLines(body: ReadableStream<Uint8Array>, onLine: (value: unknown) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const emit = (line: string) => {
    if (!line.trim()) return
    try {
      onLine(JSON.parse(line))
    } catch {
      // Not JSON (a proxy's note?): nothing to act on.
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(emit)
  }
  emit(buffer + decoder.decode())
}
