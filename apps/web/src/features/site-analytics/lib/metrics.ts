/** The day-by-day metrics the chart can show. */
export type ChartMetric = 'users' | 'pageViews' | 'sessions'

export const METRIC_LABELS: Record<ChartMetric, string> = { users: 'Visitors', pageViews: 'Page views', sessions: 'Sessions' }
