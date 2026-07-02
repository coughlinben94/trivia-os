import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Host from './views/Host.jsx'
import Display from './views/Display.jsx'
import Join from './views/Join.jsx'
import Scores from './views/Scores.jsx'
import AmbientAudit from './views/AmbientAudit.jsx'
import Questions from './views/Questions.jsx'
import Shows from './views/Shows.jsx'
import ShowDetail from './views/ShowDetail.jsx'
import Dashboard from './views/Dashboard.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/host" element={<Host />} />
        <Route path="/display" element={<Display />} />
        <Route path="/join" element={<Join />} />
        <Route path="/scores" element={<Scores />} />
        <Route path="/ambient" element={<AmbientAudit />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/shows/:showId" element={<ShowDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
