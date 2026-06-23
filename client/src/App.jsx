import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Host from './views/Host.jsx'
import Display from './views/Display.jsx'
import Join from './views/Join.jsx'
import Scores from './views/Scores.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/host" element={<Host />} />
        <Route path="/display" element={<Display />} />
        <Route path="/join" element={<Join />} />
        <Route path="/scores" element={<Scores />} />
        <Route path="*" element={<Navigate to="/host" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
