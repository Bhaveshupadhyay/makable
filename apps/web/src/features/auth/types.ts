// The backend's `UserRead` (makable-backend `app/schemas/user.py`).
export type SessionUser = {
  id: string
  login: string
  name: string | null
  avatarUrl: string
  role: 'user' | 'admin'
}
