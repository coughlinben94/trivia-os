import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const Host        = lazy(() => import('./views/Host.jsx'))
const Display     = lazy(() => import('./views/Display.jsx'))
const Join        = lazy(() => import('./views/Join.jsx'))
const Scores      = lazy(() => import('./views/Scores.jsx'))
const AmbientAudit  = lazy(() => import('./views/AmbientAudit.jsx'))
const GradientAudit = lazy(() => import('./views/GradientAudit.jsx'))
const Questions   = lazy(() => import('./views/Questions.jsx'))
const AddQuestions = lazy(() => import('./views/AddQuestions.jsx'))
const Shows       = lazy(() => import('./views/Shows.jsx'))
const ShowDetail  = lazy(() => import('./views/ShowDetail.jsx'))
const Dashboard   = lazy(() => import('./views/Dashboard.jsx'))

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
          <Route path="*" element={<Navigate to="/host" replace />} />
        </Routes>
      </RouteShell>
    </BrowserRouter>
  )
}
