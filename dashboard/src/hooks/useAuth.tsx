import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Demo credentials
const DEMO_USER: User = {
  id: 'user-1',
  email: 'admin@deadlock.solutions',
  name: 'Admin User',
  role: 'admin',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('dl_token');
    const savedUser = localStorage.getItem('dl_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Mock auth — accept demo credentials
    if (
      (email === 'admin@deadlock.solutions' && password === 'admin123') ||
      (email === 'demo' && password === 'demo')
    ) {
      const mockToken = 'mock_jwt_' + Date.now();
      setToken(mockToken);
      setUser(DEMO_USER);
      localStorage.setItem('dl_token', mockToken);
      localStorage.setItem('dl_user', JSON.stringify(DEMO_USER));
      return true;
    }
    return false;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('dl_token');
    localStorage.removeItem('dl_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
