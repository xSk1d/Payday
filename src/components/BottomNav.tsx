import { NavLink, useLocation } from 'react-router'

/** Hidden on the editors. Those are focused tasks with their own back/save header,
 *  and a nav bar there invites losing unsaved input. */
export default function BottomNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/shift/') || pathname.startsWith('/debt/')) return null

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className="nav-item">
        <span className="nav-icon" aria-hidden="true">
          ▤
        </span>
        Shifts
      </NavLink>
      <NavLink to="/debts" className="nav-item">
        <span className="nav-icon" aria-hidden="true">
          ⇄
        </span>
        Debts
      </NavLink>
      <NavLink to="/settings" className="nav-item">
        <span className="nav-icon" aria-hidden="true">
          ⚙
        </span>
        Settings
      </NavLink>
    </nav>
  )
}
