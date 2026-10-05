import { Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { LoginPage, RequireAuth } from '@/features/auth'
import { AppLayout } from './layouts/app-layout'
import { BuilderPage } from './lazy-pages'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
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
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
