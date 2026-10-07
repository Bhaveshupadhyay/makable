// A fake OpenAI-compatible model for the smoke test: always answers with the same two content ops
// (remove the first skill, new headline), wrapped in a fence like free models do. Run it with
// `bun mock-model.mjs` and start vite with AI_BASE_URL=http://localhost:9999/v1.
const reply = { summary: 'Removed the first skill and rewrote the headline.', ops: [{ op: 'remove', path: 'skills.0' }, { op: 'set', path: 'profile.headline', value: 'AI headline' }] }
Bun.serve({
  port: 9999,
  fetch: () => Response.json({ choices: [{ message: { content: '```json\n' + JSON.stringify(reply) + '\n```' } }] }),
})
