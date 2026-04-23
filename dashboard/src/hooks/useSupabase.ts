import { useState, useEffect, useCallback } from 'react';

const BASE = '/api';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Dashboard stats ────────────────────────────────────────────────────────
export interface LiveStats {
  appointments_today: number;
  pending: number;
  revenue: number;
  no_show_rate: number;
  new_patients: number;
  appointments_trend?: any[];
  treatment_breakdown?: any[];
  peak_hours?: any[];
}

export function useDashboardStats(clinicId?: string) {
  const [data, setData] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const qs = clinicId ? `?clinic_id=${clinicId}` : '';
      const result = await apiFetch<LiveStats>(`/dashboard/stats${qs}`);
      setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [load]);

  return { data, loading, error, refetch: load };
}

// ── Appointments ───────────────────────────────────────────────────────────
export interface LiveAppointment {
  id: string;
  phone: string;
  name: string;
  treatment: string;
  preferred_date: string;
  preferred_date_iso: string;
  time_slot: string;
  doctor_name: string;
  status: string;
  created_at: string;
}

export function useAppointments(clinicId?: string) {
  const [data, setData] = useState<LiveAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const SUPABASE_URL = (window as any).__SUPABASE_URL__ || '';
      const SUPABASE_KEY = (window as any).__SUPABASE_KEY__ || '';

      let url = `/appointments`;
      const result = await apiFetch<LiveAppointment[]>(url);
      setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

// ── Leads ──────────────────────────────────────────────────────────────────
export interface LiveLead {
  id: string;
  phone: string;
  name?: string;
  company_name?: string;
  owner_name?: string;
  city?: string;
  total_score: number;
  fit_score: number;
  pain_score: number;
  timing_score: number;
  reachability_score: number;
  status: string;
  pain_signals?: string[];
  last_contacted_at?: string;
  created_at: string;
}

export function useLeads(filters?: { status?: string; minScore?: number }) {
  const [data, setData] = useState<LiveLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'All') params.set('status', filters.status);
      if (filters?.minScore) params.set('min_score', String(filters.minScore));
      const qs = params.toString() ? `?${params}` : '';
      const result = await apiFetch<{ leads: LiveLead[]; total: number }>(`/leads${qs}`);
      setData(result.leads ?? ((result as unknown) as any[]));
      setTotal(result.total ?? result.leads?.length ?? 0);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.minScore]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, total, refetch: load };
}
