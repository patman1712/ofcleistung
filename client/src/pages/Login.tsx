import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

export default function Login() {
  const { login, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from?.pathname || null;
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        // default branding
      }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      nav(from || '/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const logoSrc = branding.logo || defaultLogo;
  const appName = branding.appName || DEFAULT_BRANDING.appName!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-ofc-gray to-red-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center h-28 w-28 rounded-full bg-white shadow-card border-4 border-ofc-red mb-4">
            <img
              src={logoSrc}
              alt="Logo"
              className="h-24 w-24 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultLogo; }}
            />
          </div>
          <h1 className="text-3xl font-bold text-ofc-grayDark tracking-tight">
            {appName}
          </h1>
          <p className="mt-2 text-gray-500">Kickers Offenbach 1901 e.V.</p>
        </div>

        <div className="card">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">E-Mail</label>
              <input
                id="email"
                type="email"
                required
                className="input"
                placeholder="name@ofc.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Passwort</label>
              <input
                id="password"
                type="password"
                required
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || authLoading}
              className="btn-primary w-full py-3 text-base"
            >
              {(loading || authLoading) ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} {appName}
        </p>
      </div>
    </div>
  );
}
