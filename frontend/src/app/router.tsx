import { lazy, Suspense } from 'react'
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { BootScreen, ProtectedRoute } from '@/features/auth/ProtectedRoute'
import LoginPage from '@/features/auth/LoginPage'
import { Layout, PhoneFrame } from './Layout'

// The first screens load with the app; every feature loads when first opened.
// The service worker still precaches them, so all of them work offline.
const ConsentPage = lazy(() => import('@/features/auth/ConsentPage'))
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'))
const SettingsPage = lazy(() => import('@/features/profile/SettingsPage'))
const BriefPage = lazy(() => import('@/features/brief/BriefPage'))
const WeatherPage = lazy(() => import('@/features/weather/WeatherPage'))
const DoctorPage = lazy(() => import('@/features/doctor/DoctorPage'))
const LabelPage = lazy(() => import('@/features/label/LabelPage'))
const KagazPage = lazy(() => import('@/features/kagaz/KagazPage'))
const MandiPage = lazy(() => import('@/features/mandi/MandiPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const SchemesPage = lazy(() => import('@/features/schemes/SchemesPage'))

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

/** Full-screen steps (consent, onboarding): phone frame, no nav. */
function Bare() {
  return (
    <PhoneFrame>
      <div className="sc h-full overflow-y-auto">
        <Suspense fallback={<BootScreen />}>
          <Outlet />
        </Suspense>
      </div>
    </PhoneFrame>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        path: '/login',
        element: (
          <PhoneFrame>
            <LoginPage />
          </PhoneFrame>
        ),
      },
      {
        element: (
          <ProtectedRoute requireProfile={false}>
            <Bare />
          </ProtectedRoute>
        ),
        children: [
          { path: '/consent', element: <ConsentPage /> },
          { path: '/onboarding', element: <OnboardingPage /> },
        ],
      },
      {
        element: (
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        ),
        children: [
          { path: '/', element: <BriefPage /> },
          { path: '/weather', element: <WeatherPage /> },
          { path: '/doctor', element: <DoctorPage /> },
          { path: '/label', element: <LabelPage /> },
          { path: '/kagaz', element: <KagazPage /> },
          { path: '/mandi', element: <MandiPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/schemes', element: <SchemesPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
