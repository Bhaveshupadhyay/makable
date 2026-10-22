import { lazy } from 'react'

// The builder pulls in Sandpack, so it loads on demand and the app shell stays small.
export const AiSettingsPage = lazy(() => import('@/features/ai-models').then((m) => ({ default: m.AiSettingsPage })))

export const AnalyticsPage = lazy(() => import('@/features/site-analytics').then((m) => ({ default: m.AnalyticsPage })))

export const BuilderPage = lazy(() => import('@/features/builder').then((m) => ({ default: m.BuilderPage })))
