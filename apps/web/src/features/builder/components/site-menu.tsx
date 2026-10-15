import { Check, ChevronDown, ExternalLink, Plus } from 'lucide-react'
import { type SiteRead, useSiteStore } from '@/features/site'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useSites } from '../hooks/use-sites'

/** The chat's header: the site's name, and a menu to open another of the user's sites or start a new one. */
export function SiteMenu({ disabled = false }: { disabled?: boolean }) {
  const site = useSiteStore((s) => s.site)
  const projectId = useSiteStore((s) => s.projectId)
  const { data: sites = [], refetch } = useSites()
  const open = (other: SiteRead) => other.projectId !== projectId && useSiteStore.getState().open(other)

  return (
    <DropdownMenu onOpenChange={(isOpen) => isOpen && void refetch()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-w-0 max-w-full justify-start gap-1 px-2" disabled={disabled}>
          <span className="truncate font-medium">{site?.name ?? 'New site'}</span>
          <ChevronDown className="shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onSelect={() => useSiteStore.getState().newSite()}>
          <Plus />
          New site
        </DropdownMenuItem>
        {site?.repoUrl && (
          <DropdownMenuItem asChild>
            <a href={site.repoUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open the repo on GitHub
            </a>
          </DropdownMenuItem>
        )}
        {sites.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Your sites</DropdownMenuLabel>
            {sites.slice(0, 30).map((other) => (
              <DropdownMenuItem key={other.projectId} onSelect={() => open(other)}>
                {other.projectId === projectId ? <Check /> : <span className="size-4" />}
                <span className="truncate">{other.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
