import { LoaderCircle, Rocket } from 'lucide-react'
import { useAiEditPending } from '@/features/ai-edit'
import { Button } from '@/shared/ui/button'
import type { Builder } from '../hooks/use-builder'

/** Publish in the app header: starts (or repeats) publishing in the chat. */
export function PublishButton({ builder }: { builder: Pick<Builder, 'conversation' | 'publish'> }) {
  const stage = builder.conversation.publish?.stage
  const working = stage === 'running' || stage === 'deploying'
  // An AI answer is for the site as it was sent: publish after it lands.
  const aiPending = useAiEditPending()
  const label = stage === 'running' ? 'Publishing…' : stage === 'deploying' ? 'Deploying…' : 'Publish'

  return (
    <Button
      size="sm"
      title={builder.publish.published ? 'Publish your changes' : 'Publish your site'}
      disabled={!builder.conversation.portfolio || stage === 'running' || aiPending}
      onClick={builder.publish.start}
    >
      {working ? <LoaderCircle className="animate-spin" /> : <Rocket />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
  )
}
