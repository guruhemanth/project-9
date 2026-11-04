import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../api-client';
import type { UserProfile, UserRole } from '@caterconnect/shared';

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  role: UserRole | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  signOut: () => Promise<void>;
  setMockSession: (user: any, profile: any) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  signOut: async () => {},
  setMockSession: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('caterconnect_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
        setUser(res.user);
      } catch (err) {
        console.warn('Failed to fetch session user:', err);
        localStorage.removeItem('caterconnect_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [token]);

  const login = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem('caterconnect_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('caterconnect_token');
    setToken(null);
    setUser(null);
  };

  const signOut = async () => {
    logout();
  };

  const setMockSession = (_u: any, p: any) => {
    setUser({
      id: p.id,
      role: p.role,
      fullName: p.full_name || p.fullName,
      phone: p.phone,
      createdAt: p.created_at || new Date().toISOString(),
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user,
        role: user?.role || null,
        token,
        loading,
        login,
        logout,
        signOut,
        setMockSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
