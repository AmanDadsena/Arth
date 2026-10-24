import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/api/queries'
import { env } from '@/lib/env'
import { router } from '@/app/router'
import '@/i18n'
import './index.css'

/**
 * Last line of defence: one render error must not leave a blank page. This
 * screen depends on nothing that could itself have failed — no router, no i18n.
 */
const OOPS = {
  mr: { title: 'काहीतरी चुकलं', body: 'ॲप पुन्हा उघडून पहा.', reload: 'पुन्हा उघडा' },
  hi: { title: 'कुछ गड़बड़ हुई', body: 'ऐप दोबारा खोलकर देखें.', reload: 'दोबारा खोलें' },
  en: { title: 'Something went wrong', body: 'Try reopening the app.', reload: 'Reopen' },
}

class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Arth crashed', error.message, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    let lang: keyof typeof OOPS = 'mr'
    try {
      const v = localStorage.getItem('arth.lang')
      if (v === 'en' || v === 'hi' || v === 'mr') lang = v
    } catch {
      /* unreadable storage is one of the things that may have failed */
    }
    const s = OOPS[lang]
    return (
      <div style={{ minHeight: '100vh', background: '#DCD7C9', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 360, background: '#fff', borderRadius: 28, padding: 28, fontFamily: 'system-ui, sans-serif', color: '#17150F' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{s.title}</div>
          <p style={{ fontSize: 17, lineHeight: 1.5, marginTop: 10, color: '#4A4638' }}>{s.body}</p>
          <button
            onClick={() => location.assign('/')}
            style={{ marginTop: 18, width: '100%', padding: '16px 0', borderRadius: 22, border: 0, background: '#2E6B3F', color: '#fff', fontSize: 18, fontWeight: 600 }}
          >
            {s.reload}
          </button>
        </div>
      </div>
    )
  }
}

async function start() {
  // dev only: MSW answers the API so requests show in the network tab.
  // Production builds with mocks on answer in-process instead (see lib/api/client).
  if (import.meta.env.DEV && env.useMocks) {
    // started once per page; hot reloads re-run this module
    const g = globalThis as { __arthMsw?: Promise<unknown> }
    g.__arthMsw ??= import('./mocks/browser').then(({ worker }) => worker.start({ quiet: true }))
    await g.__arthMsw
  }
  // one root per page, even when a hot reload re-runs this module
  const g = globalThis as { __arthRoot?: ReturnType<typeof createRoot> }
  g.__arthRoot ??= createRoot(document.getElementById('root')!)
  g.__arthRoot.render(
    <StrictMode>
      <Crash>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </Crash>
    </StrictMode>,
  )
}

void start()
