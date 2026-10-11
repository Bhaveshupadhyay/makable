// A platform token pasted in the chat, held in memory only until the publish that needs it has used it. It never
// goes into the conversation (which is persisted and saved to GitHub) and is gone after a reload.

let token: string | null = null

export const publishToken = {
  set: (value: string) => {
    token = value
  },
  get: () => token,
  clear: () => {
    token = null
  },
}
