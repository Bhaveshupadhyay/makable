import { LoaderCircle } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { Button } from '@/shared/ui/button'
import { BuilderPreview } from '../components/builder-preview'
import { ChatPanel } from '../components/chat-panel'
import { useBuilder } from '../hooks/use-builder'

/** Chat first; once a template is picked, chat and live preview side by side. */
export function BuilderPage() {
  const builder = useBuilder()
  const wide = useMediaQuery('(min-width: 768px)')
  const { portfolio } = builder.conversation

  if (builder.status === 'loading') {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (builder.status === 'offline') {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">Couldn't reach the server.</p>
        <Button variant="outline" onClick={builder.retry}>
          Try again
        </Button>
      </div>
    )
  }

  // The app header is h-14; the workspace fills the rest of the viewport.
  return (
    <div className="h-[calc(100svh-3.5rem)]">
      {portfolio ? (
        <Group orientation={wide ? 'horizontal' : 'vertical'}>
          <Panel defaultSize={wide ? '34' : '45'} minSize={wide ? '320px' : '25'}>
            <ChatPanel builder={builder} />
          </Panel>
          <Separator className="bg-border transition-colors hover:bg-ring data-[separator=active]:bg-ring aria-[orientation=horizontal]:h-px aria-[orientation=vertical]:w-px" />
          <Panel minSize={wide ? '360px' : '25'}>
            <BuilderPreview draft={{ portfolio, files: builder.fileEdits }} onChange={builder.setDraft} builder={builder} />
          </Panel>
        </Group>
      ) : (
        <ChatPanel builder={builder} />
      )}
    </div>
  )
}
