// Único punto que elige la implementación: mock o Supabase. La UI solo importa de aquí.
import * as supabaseAuth from './auth';
import type { Session } from './auth';
import { hasSupabaseConfig } from './client';
import { mockApi, mockAuth } from './mock';
import { api as supabaseApi } from './supabase';
import type { FinanceApi } from './types';

export type { Session } from './auth';
export * from './types';

export interface AuthApi {
  getSession(): Promise<Session | null>;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  takeCallbackError(): string | null;
}

/** Datos en memoria: por VITE_USE_MOCK o si falta la configuración de Supabase. */
export const usingMock = import.meta.env.VITE_USE_MOCK === 'true' || !hasSupabaseConfig;
/** La sesión es real siempre que haya Supabase configurado, aunque los datos sean del mock. */
export const usingMockAuth = !hasSupabaseConfig;

export const api: FinanceApi = usingMock ? mockApi : supabaseApi;
export const auth: AuthApi = usingMockAuth ? mockAuth : supabaseAuth;
