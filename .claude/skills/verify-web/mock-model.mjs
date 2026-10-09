// A fake OpenAI-compatible model for the smoke test. It reads the files in the prompt and answers
// with search/replace edits, wrapped in a fence like free models do: in the content file, a new
// headline and the first skill removed; in the stylesheet, an outline on the headline (an
// AI-edited file). An instruction containing "slowly" waits 5 s first, to test Stop. Run it with `bun mock-model.mjs` and start makable-backend with AI_BASE_URL=http://localhost:9999/v1 AI_DEBUG=true.
const fileIn = (prompt, pattern) => {
  const match = new RegExp(`<file path="(${pattern})"[^>]*>\\n([\\s\\S]*?)\\n</file>`).exec(prompt)
  return match && { path: match[1], content: match[2] }
}

function answer(prompt) {
  const content = fileIn(prompt, '[^"]*content/portfolio\\.[jt]s')
  const css = fileIn(prompt, '[^"]*\\.css')
  if (!content || !css) return { escalate: 'The mock model needs the content file and a stylesheet.' }
  const edits = []
  const headline = /^\s*"headline": ".*",?$/m.exec(content.content)[0]
  edits.push({ path: content.path, search: headline, replace: headline.replace(/"headline": ".*"/, '"headline": "AI headline"') })
  const skill = /"skills": \[\n\s+"(?:[^"\\]|\\.)*",?\n/.exec(content.content)
  if (skill) edits.push({ path: content.path, search: skill[0], replace: '"skills": [\n' })
  const firstLine = css.content.split('\n')[0]
  edits.push({ path: css.path, search: firstLine, replace: `${firstLine}\n[data-content="profile.headline"] { outline: 3px solid rgb(16, 185, 129); }` })
  return { summary: 'Removed the first skill, rewrote the headline and outlined it.', edits }
}

Bun.serve({
  port: 9999,
  async fetch(req) {
    const { messages } = await req.json()
    const prompt = messages.at(-1).content
    if (/<instruction>[^<]*slowly/.test(prompt)) await Bun.sleep(5000)
    const reply = answer(prompt)
    return Response.json({ choices: [{ message: { content: '```json\n' + JSON.stringify(reply) + '\n```' } }] })
  },
})
