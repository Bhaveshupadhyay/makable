import { KeyRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

/**
 * Where a platform token is pasted. A password field, so the token isn't shown, and it never becomes a chat
 * message: only its last 4 characters are. It's sent to the backend once, for the user's repo secrets.
 */
export function PublishTokenForm({ platform, onSubmit }: { platform: string; onSubmit: (token: string) => void }) {
  const [token, setToken] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    onSubmit(token)
    setToken('')
  }

  return (
    <form onSubmit={submit} className="flex max-w-md items-center gap-2">
      <Input
        type="password"
        aria-label={`${platform} token`}
        placeholder={`${platform} token`}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={!token.trim()}>
        <KeyRound />
        Use token
      </Button>
    </form>
  )
}
