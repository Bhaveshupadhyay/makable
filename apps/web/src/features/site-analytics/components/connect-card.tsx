import { LoaderCircle } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { GoogleIcon } from './google-icon'

/** Before Google is connected: what connecting does, and the button that goes to Google's consent page. */
export function ConnectCard({ onConnect, pending, error, reconnect = false }: { onConnect: () => void; pending: boolean; error: string | null; reconnect?: boolean }) {
  return (
    <section aria-labelledby="connect-title" className="space-y-4 rounded-xl border p-6">
      <div className="space-y-2">
        <h2 id="connect-title" className="text-lg font-semibold">
          {reconnect ? 'Connect Google Analytics again' : 'See who visits your site'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {reconnect
            ? 'makable can’t read your Google Analytics any more: access was removed, or it expired. Connect again to see your traffic.'
            : 'Connect your Google Analytics account and pick the property your site reports to. makable adds Google’s tag when you publish, then shows your visitors, page views and where they come from here.'}
        </p>
        <p className="text-xs text-muted-foreground">makable only asks to read your Analytics data. You can disconnect at any time.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={onConnect} disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <GoogleIcon />}
        Connect Google Analytics
      </Button>
    </section>
  )
}
