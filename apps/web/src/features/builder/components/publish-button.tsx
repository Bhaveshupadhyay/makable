import { LoaderCircle, Rocket } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { PublishStage } from '../lib/publish-flow'

/** Publish in the app header: starts (or repeats) publishing in the chat. */
export function PublishButton({ stage, published, disabled, onPublish }: { stage: PublishStage | undefined; published: boolean; disabled?: boolean; onPublish: () => void }) {
  const working = stage === 'running' || stage === 'deploying'
  const label = stage === 'running' ? 'Publishing…' : stage === 'deploying' ? 'Deploying…' : 'Publish'

  return (
    <Button size="sm" title={published ? 'Publish your changes' : 'Publish your site'} disabled={disabled || stage === 'running'} onClick={onPublish}>
      {working ? <LoaderCircle className="animate-spin" /> : <Rocket />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
  )
}
