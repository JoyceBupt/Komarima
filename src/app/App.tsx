import { Navigate, Route, Routes } from 'react-router-dom'
import { LiveProbeWorkspace } from '../features/workspace/LiveProbeWorkspace'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LiveProbeWorkspace />} />
      <Route path="/instance/:uuid" element={<LiveProbeWorkspace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
