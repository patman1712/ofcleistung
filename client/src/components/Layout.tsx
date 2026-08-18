import React, { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.svg';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const adminLinks = [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/players', label: 'Spieler' },
    { to: '/admin/daily-questions', label: 'Tägliche Fragen' },
    { to: '/admin/trainings', label: 'Trainings' },
    { to: '/admin/evaluations', label: 'Auswertungen' },
    { to: '/admin/alerts', label: 'Warnsignale' },
  ];
  const playerLinks = [
    { to: '/player', label: 'Start', end: true },
    { to: '/player/daily', label: 'Tägliche Abfrage' },
    { to: '/player/profile', label: 'Mein Profil' },
  ];
  const links = user?.role === 'ADMIN' ? adminLinks : playerLinks;
  const prefix = user?.role === 'ADMIN' ? '/admin' : '/player';

  const doLogout = () => {
    logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-ofc-gray">
      {/* Top Header */}
      <header className="bg-ofc-red text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="OFC" className="h-12 w-12 bg-white rounded-full object-contain border-2 border-white" />
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight">
                OFC Leistungsdiagnostik
              </h1>
              <p className="text-xs text-white/80 hidden md:block">
                Kickers Offenbach 1901 e.V.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-white/80">
                {user?.role === 'ADMIN' ? 'Staff/Admin' : 'Spieler'}
              </div>
            </div>
            <button
              onClick={doLogout}
              className="bg-white text-ofc-red hover:bg-ofc-gray text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Logout
            </button>
            <button
              className="md:hidden text-white"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menü öffnen"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Nav-Links */}
        <nav className={`${mobileOpen ? 'block' : 'hidden'} md:block border-t border-white/20 bg-ofc-redDark/40`}>
          <div className="max-w-7xl mx-auto px-4">
            <ul className="flex flex-col md:flex-row md:items-center md:gap-1 py-2 md:py-1 gap-1">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive ? 'bg-white text-ofc-red' : 'text-white hover:bg-white/15'
                      }`
                    }
                    onClick={() => setMobileOpen(false)}
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      <footer className="mt-16 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <img src={logo} alt="OFC" className="h-6 w-6" />
            <span>© {new Date().getFullYear()} OFC Leistungsdiagnostik · Kickers Offenbach 1901 e.V.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
