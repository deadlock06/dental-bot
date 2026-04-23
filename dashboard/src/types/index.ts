// Types for the dental bot dashboard

export interface Clinic {
  id: string;
  name: string;
  whatsapp_number: string;
  location: string;
  maps_link?: string;
  review_link?: string;
  staff_phone?: string;
  plan: 'basic' | 'pro';
  status: 'active' | 'inactive';
  config?: {
    features?: {
      reschedule?: boolean;
      cancel?: boolean;
      staff_notifications?: boolean;
      google_calendar?: boolean;
    };
    messages?: Record<string, string>;
    booking_rules?: {
      min_advance_hours?: number;
      max_advance_days?: number;
    };
  };
  doctors?: Doctor[];
  created_at: string;
}

export interface Doctor {
  id: string;
  clinic_id: string;
  doctor_id: string;
  doctor_name: string;
  working_days: string[];
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface Patient {
  id?: string;
  phone: string;
  name?: string;
  language: 'ar' | 'en' | null;
  current_flow: string | null;
  flow_step: number;
  updated_at: string;
  total_appointments?: number;
  last_visit?: string;
  status?: 'active' | 'inactive';
}

export interface Appointment {
  id: string;
  phone: string;
  clinic_id: string;
  name: string;
  treatment: string;
  description?: string;
  preferred_date: string;
  preferred_date_iso?: string;
  time_slot: string;
  doctor_id?: string;
  doctor_name?: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no-show';
  reminder_sent_24h: boolean;
  reminder_sent_1h: boolean;
  follow_up_sent: boolean;
  created_at: string;
  calendar_event_id?: string;
}

export interface DashboardStats {
  appointments_today: number;
  pending: number;
  revenue: number;
  no_show_rate: number;
  new_patients: number;
  appointments_trend: { date: string; count: number }[];
  treatment_breakdown: { name: string; value: number; color: string }[];
  peak_hours: { hour: string; count: number }[];
}

export interface ActivityItem {
  id: string;
  type: 'booking' | 'cancellation' | 'reminder' | 'reschedule' | 'no_show';
  message: string;
  time: string;
  patient?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager';
  clinic_id?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no-show';
export type DoctorDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type ClinicPlan = 'basic' | 'pro';
export type Period = '7d' | '30d' | '90d';

export interface Lead {
  id: string;
  phone: string;
  company_name?: string;
  name?: string;
  source: string;
  category: string;
  status: 'new' | 'contacted' | 'messaged' | 'bumped_1' | 'bumped_2' | 'opted_out' | 'engaged' | 'handed_off';
  total_score: number;
  fit_score: number;
  pain_score: number;
  timing_score: number;
  reachability_score: number;
  pain_signals?: any[];
  last_contacted_at?: string;
  created_at: string;
  metadata?: any;
}

export type LeadStatus = 'new' | 'contacted' | 'messaged' | 'bumped_1' | 'bumped_2' | 'opted_out' | 'engaged' | 'handed_off';
