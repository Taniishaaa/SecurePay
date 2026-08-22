import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">SecurePay</span>
        <nav>
          {user && (
            <NavLink to="/" className={navLinkClass} end>
              Dashboard
            </NavLink>
          )}
          {user && (
            <NavLink to="/security" className={navLinkClass}>
              Security
            </NavLink>
          )}
          {!user && (
            <NavLink to="/login" className={navLinkClass}>
              Login
            </NavLink>
          )}
          {!user && (
            <NavLink to="/register" className={navLinkClass}>
              Register
            </NavLink>
          )}
          {user && (
            <span className="nav-user">
              {user.fullName} · {user.role}
            </span>
          )}
          {user && (
            <button type="button" className="nav-logout" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          )}
        </nav>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
