// makable-backend's analytics API (`schemas/analytics.py`). Google's tokens never reach the browser.

export type GoogleConnection = { configured: boolean; connected: boolean; email: string | null }

export type GaProperty = { id: string; name: string }
export type GaAccount = { id: string; name: string; properties: GaProperty[] }
export type GaStream = { id: string; name: string; measurementId: string; url: string | null }

export type SiteAnalyticsLink = {
  propertyId: string
  propertyName: string
  streamId: string
  streamName: string
  measurementId: string
  streamUrl: string | null
  timeZone: string
  /** The site's deploy has the stream's tag: visits are being counted. */
  tagPublished: boolean
}

export type SiteAnalyticsStatus = { connection: GoogleConnection; link: SiteAnalyticsLink | null; createUrl: string }

export const REPORT_RANGES = ['7d', '28d', '90d'] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export type AnalyticsTotals = {
  users: number
  newUsers: number
  sessions: number
  pageViews: number
  averageSessionSeconds: number
  /** Fractions (0.25 is 25%). */
  bounceRate: number
  engagementRate: number
}

export type AnalyticsDay = { date: string; users: number; sessions: number; pageViews: number }
export type AnalyticsCount = { name: string; value: number }

export type AnalyticsReport = {
  range: ReportRange
  startDate: string
  endDate: string
  totals: AnalyticsTotals
  /** The same number of days just before the range. */
  previous: AnalyticsTotals
  daily: AnalyticsDay[]
  topPages: AnalyticsCount[]
  sources: AnalyticsCount[]
  countries: AnalyticsCount[]
  devices: AnalyticsCount[]
  /** Users in the last 30 minutes. */
  activeNow: number
  fetchedAt: string
}
