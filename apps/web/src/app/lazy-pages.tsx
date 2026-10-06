import { lazy } from 'react'

// The builder pulls in Sandpack, so it loads on demand and the app shell stays small.
export const BuilderPage = lazy(() => import('@/features/builder').then((m) => ({ default: m.BuilderPage })))
