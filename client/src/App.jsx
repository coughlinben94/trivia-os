import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazyRetry } from './lib/lazyRetry.js'

const Host        = lazy(lazyRetry(() => import('./views/Host.jsx')))
const Display     = lazy(lazyRetry(() => import('./views/Display.jsx')))
const Join        = lazy(lazyRetry(() => import('./views/Join.jsx')))
const Scores      = lazy(lazyRetry(() => import('./views/Scores.jsx')))
const AmbientAudit  = lazy(lazyRetry(() => import('./views/AmbientAudit.jsx')))
const GradientAudit = lazy(lazyRetry(() => import('./views/GradientAudit.jsx')))
const Questions   = lazy(lazyRetry(() => import('./views/Questions.jsx')))
const AddQuestions = lazy(lazyRetry(() => import('./views/AddQuestions.jsx')))
const Shows       = lazy(lazyRetry(() => import('./views/Shows.jsx')))
const ShowDetail  = lazy(lazyRetry(() => import('./views/ShowDetail.jsx')))
const Dashboard   = lazy(lazyRetry(() => import('./views/Dashboard.jsx')))
const SpotifyCallback = lazy(lazyRetry(() => import('./views/SpotifyCallback.jsx')))
const Music       = lazy(lazyRetry(() => import('./views/Music.jsx')))

function RouteShell({ children }) {
  return (
    <Suspense fallback={<div style={{ display: 'none' }} />}>
      {children}
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteShell>
        <Routes>
          <Route path="/host" element={<Host />} />
          <Route path="/display" element={<Display />} />
          <Route path="/join" element={<Join />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="/ambient" element={<AmbientAudit />} />
          <Route path="/gradient" element={<GradientAudit />} />
          <Route path="/questions" element={<Questions />} />
          <Route path="/questions/add" element={<AddQuestions />} />
          <Route path="/shows" element={<Shows />} />
          <Route path="/shows/:showId" element={<ShowDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/spotify-callback" element={<SpotifyCallback />} />
          <Route path="/music" element={<Music />} />
          <Route path="*" element={<Navigate to="/host" replace />} />
        </Routes>
      </RouteShell>
    </BrowserRouter>
  )
}
