'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type SystemRole = 'SUPER_ADMIN' | 'ADMIN' | 'JUDGE' | 'COACH' | 'CLUB' | 'SWIMMER';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  primaryRole: SystemRole;
  clubId: string | null;
  swimmerId: string | null;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Código de perfil (FTN-XXXX-XXXX) que entrega el club o la federación. Opcional: sin código la cuenta se crea sin vincular. */
  claimCode?: string;
}

/** Respuesta de `POST /auth/register`. */
export interface RegisterResult {
  message: string;
  /** El código de perfil fue aceptado y la cuenta quedó asociada. */
  linked?: boolean;
  /** El email ya está verificado: se puede iniciar sesión sin pasos extra. */
  verified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const decoded = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Arma un mensaje legible desde el cuerpo de error de Nest (string o string[]). */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  if (Array.isArray(body.message)) {
    const joined = body.message.filter((m) => typeof m === 'string' && m.length > 0).join('. ');
    return joined || fallback;
  }
  return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
}

const NETWORK_ERROR_MESSAGE = 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';

async function fetchMe(token: string): Promise<Partial<AuthUser>> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    return res.json() as Promise<Partial<AuthUser>>;
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ftn_access_token');
    if (!token) { setIsLoading(false); return; }

    const payload = parseJwtPayload(token);
    const exp = payload.exp as number | undefined;
    if (exp && exp * 1000 < Date.now()) {
      localStorage.removeItem('ftn_access_token');
      localStorage.removeItem('ftn_refresh_token');
      setIsLoading(false);
      return;
    }

    setAccessToken(token);
    // Try to get full user from /auth/me to get firstName, lastName, swimmerId
    void fetchMe(token).then((me) => {
      setUser({
        id: (me.id ?? payload.sub) as string,
        email: (me.email ?? payload.email) as string,
        firstName: (me.firstName ?? '') as string,
        lastName: (me.lastName ?? '') as string,
        primaryRole: (me.primaryRole ?? payload.primaryRole) as SystemRole,
        clubId: (me.clubId ?? payload.clubId ?? null) as string | null,
        swimmerId: (me.swimmerId ?? null) as string | null,
      });
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Credenciales incorrectas'));
    }
    const { accessToken: at, refreshToken: rt } = await res.json() as {
      accessToken: string;
      refreshToken: string;
    };
    localStorage.setItem('ftn_access_token', at);
    localStorage.setItem('ftn_refresh_token', rt);
    setAccessToken(at);

    const me = await fetchMe(at);
    const payload = parseJwtPayload(at);
    setUser({
      id: (me.id ?? payload.sub) as string,
      email: (me.email ?? payload.email) as string,
      firstName: (me.firstName ?? '') as string,
      lastName: (me.lastName ?? '') as string,
      primaryRole: (me.primaryRole ?? payload.primaryRole) as SystemRole,
      clubId: (me.clubId ?? payload.clubId ?? null) as string | null,
      swimmerId: (me.swimmerId ?? null) as string | null,
    });
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<RegisterResult> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'No pudimos crear tu cuenta. Intentá de nuevo.'));
    }
    const body = (await res.json().catch(() => ({}))) as Partial<RegisterResult>;
    return {
      message: typeof body.message === 'string' ? body.message : '',
      linked: body.linked === true,
      verified: body.verified === true,
    };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ftn_access_token');
    localStorage.removeItem('ftn_refresh_token');
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export function roleLabel(role: SystemRole): string {
  return {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Administrador FTN',
    JUDGE: 'Juez',
    COACH: 'Entrenador',
    CLUB: 'Club',
    SWIMMER: 'Nadador',
  }[role] ?? role;
}

export function roleRedirect(role: SystemRole): string {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin';
  if (role === 'COACH') return '/entrenador';
  if (role === 'SWIMMER') return '/nadador';
  return '/';
}
