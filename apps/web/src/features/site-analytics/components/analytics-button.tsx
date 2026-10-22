import { ChartNoAxesColumn } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

/** Analytics in the app header: the open site's traffic, from the user's Google Analytics. */
export function AnalyticsButton({ projectId }: { projectId: string }) {
  return (
    <Button asChild size="sm" variant="ghost" title="See your site's traffic">
      <Link to={`/analytics/${projectId}`}>
        <ChartNoAxesColumn />
        <span className="hidden sm:inline">Analytics</span>
        <span className="sr-only sm:hidden">Analytics</span>
      </Link>
    </Button>
  )
}
