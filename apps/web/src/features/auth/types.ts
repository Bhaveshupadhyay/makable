// TODO: move to packages/shared once the control plane shares this schema.
export type SessionUser = {
  id: string
  login: string
  name: string | null
  avatarUrl: string
}
