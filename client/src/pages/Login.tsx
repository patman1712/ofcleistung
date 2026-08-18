import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.svg';

export default function Login() {
  const { login, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from?.pathname || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-ofc-gray to-red-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center h-28 w-28 rounded-full bg-white shadow-card border-4 border-ofc-red mb-4">
            <img src={logo} alt="OFC" className="h-24 w-24 object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-ofc-grayDark tracking-tight">
            OFC Leistungsdiagnostik
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
              {loading ? 'Login läuft...' : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-ofc-gray border border-gray-100 text-xs text-gray-500">
            <div className="font-semibold text-gray-700 mb-1">Test-Zugang (nach Seed):</div>
            <div>Admin: <span className="font-mono">admin@ofc.de</span> / <span className="font-mono">OFCkickt1901!</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
