import { Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './layouts/app-layout'
import { BuilderPage } from './lazy-pages'

// No sign-in wall: the builder works for guests, and the chat asks them to connect
// GitHub only when they reach a feature that needs it.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense>
            <BuilderPage />
          </Suspense>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
