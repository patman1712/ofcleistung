import React, { ReactNode, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import defaultLogo from '../assets/logo.svg';
import api from '../lib/api';

interface Branding {
  logo: string | null;
  favicon: string | null;
  appTitle: string | null;
  appName: string | null;
}

const DEFAULT_BRANDING: Branding = {
  logo: null,
  favicon: null,
  appTitle: 'OFC Leistungsdiagnostik',
  appName: 'OFC Leistungsdiagnostik',
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings/branding');
        if (res.data) {
          const b: Branding = { ...DEFAULT_BRANDING, ...res.data };
          setBranding(b);

          if (b.appTitle) document.title = b.appTitle;

          if (b.favicon) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = b.favicon;

            let apple = document.querySelector("link[rel~='apple-touch-icon']") as HTMLLinkElement | null;
            if (!apple) {
              apple = document.createElement('link');
              apple.rel = 'apple-touch-icon';
              document.head.appendChild(apple);
            }
            apple.href = b.favicon;
          }
        }
      } catch (e) {
        // Fallback auf DEFAULT_BRANDING
      }
    })();
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF';
  const isAdminArea = isAdmin || isStaff;
  const isPlayer = user?.role === 'PLAYER';

  const allAdminLinks = [
    { to: '/admin', label: 'Dashboard', end: true, require: 'ANY' as 'ANY' | 'ADMIN' },
    { to: '/admin/players', label: 'Spieler', end: false, require: 'ADMIN' as 'ANY' | 'ADMIN' },
    { to: '/admin/daily-questions', label: 'Tägliche Fragen', end: false, require: 'ANY' as 'ANY' | 'ADMIN' },
    { to: '/admin/trainings', label: 'Trainings', end: false, require: 'ANY' as 'ANY' | 'ADMIN' },
    { to: '/admin/evaluations', label: 'Auswertungen', end: false, require: 'ANY' as 'ANY' | 'ADMIN' },
    { to: '/admin/alerts', label: 'Warnsignale', end: false, require: 'ANY' as 'ANY' | 'ADMIN' },
    { to: '/admin/settings', label: '⚙️ Einstellungen', end: false, require: 'ADMIN' as 'ANY' | 'ADMIN' },
  ];
  const adminLinks = allAdminLinks.filter((l) => l.require === 'ANY' || isAdmin);

  const playerLinks = [
    { to: '/player', label: 'Start', end: true },
    { to: '/player/daily', label: 'Tägliche Abfrage' },
    { to: '/player/profile', label: 'Mein Profil' },
  ];
  const links = isAdminArea ? adminLinks : playerLinks;

  const logoSrc = branding.logo || defaultLogo;
  const appName = branding.appName || DEFAULT_BRANDING.appName!;

  const doLogout = () => {
    logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-ofc-gray">
      {/* Top Header */}
      <header className="bg-ofc-red text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoSrc}
              alt="Logo"
              className="h-12 w-12 flex-shrink-0 bg-white rounded-full object-contain border-2 border-white shadow-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultLogo; }}
            />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight truncate">
                {appName}
              </h1>
              <p className="text-xs text-white/80 hidden md:block truncate">
                Kickers Offenbach 1901 e.V.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="text-right hidden sm:block min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-xs text-white/80">
                {isAdmin ? 'Admin' : isStaff ? 'Staff' : 'Spieler'}
              </div>
            </div>
            <button
              onClick={doLogout}
              className="bg-white text-ofc-red hover:bg-gray-100 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Logout
            </button>
            <button
              className="md:hidden text-white flex-shrink-0"
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
                    end={(l as any).end}
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
            <img
              src={logoSrc}
              alt="Logo"
              className="h-6 w-6 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultLogo; }}
            />
            <span>© {new Date().getFullYear()} {appName} · Kickers Offenbach 1901 e.V.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
