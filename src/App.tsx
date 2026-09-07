import { Navigate, Route, Routes } from 'react-router'
import BottomNav from './components/BottomNav'
import ShiftsPage from './routes/ShiftsPage'
import ShiftEditPage from './routes/ShiftEditPage'
import DebtsPage from './routes/DebtsPage'
import DebtEditPage from './routes/DebtEditPage'
import SettingsPage from './routes/SettingsPage'

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<ShiftsPage />} />
        <Route path="/shift/new" element={<ShiftEditPage />} />
        <Route path="/shift/:id" element={<ShiftEditPage />} />
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/debt/new" element={<DebtEditPage />} />
        <Route path="/debt/:id" element={<DebtEditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
