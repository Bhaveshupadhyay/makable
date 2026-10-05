import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useLogout, useSession } from '../hooks/use-session'

export function UserMenu() {
  const { data: user } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()

  if (!user) return null

  return (
    <div className="flex items-center gap-3">
      <img src={user.avatarUrl} alt="" className="size-7 rounded-full" />
      <span className="hidden text-sm font-medium sm:inline">{user.name ?? user.login}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        disabled={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
      >
        <LogOut />
      </Button>
    </div>
  )
}
