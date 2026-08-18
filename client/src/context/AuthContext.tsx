import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api from '../lib/api';

export type Role = 'ADMIN' | 'STAFF' | 'PLAYER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  playerProfile?: any | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.token) {
      localStorage.setItem('ofc_token', res.data.token);
      localStorage.setItem('ofc_user', JSON.stringify(res.data.user));
    }
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('ofc_token');
    localStorage.removeItem('ofc_user');
    api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
