// Mock data for development
import type { Clinic, Doctor, Patient, Appointment, DashboardStats, ActivityItem } from '../types';

export const MOCK_CLINICS: Clinic[] = [
  {
    id: 'clinic-1',
    name: 'Alhala Dental Clinic',
    whatsapp_number: '14155238886',
    location: 'Riyadh, Saudi Arabia',
    maps_link: 'https://maps.google.com',
    review_link: 'https://g.page/r/alhala',
    staff_phone: '966501234567',
    plan: 'pro',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    config: {
      features: { reschedule: true, cancel: true, staff_notifications: true },
    },
  },
  {
    id: 'clinic-2',
    name: 'Smile Dental Center',
    whatsapp_number: '14155238887',
    location: 'Jeddah, Saudi Arabia',
    staff_phone: '966509876543',
    plan: 'basic',
    status: 'active',
    created_at: '2026-02-15T00:00:00Z',
  },
];

export const MOCK_DOCTORS: Doctor[] = [
  {
    id: 'doc-1',
    clinic_id: 'clinic-1',
    doctor_id: 'dr-marjuk',
    doctor_name: 'Dr. Marjuk Hasan',
    working_days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    start_time: '09:00',
    end_time: '17:00',
    break_start: '13:00',
    break_end: '14:00',
    slot_duration_minutes: 30,
    is_active: true,
  },
  {
    id: 'doc-2',
    clinic_id: 'clinic-1',
    doctor_id: 'dr-narmin',
    doctor_name: 'Dr. Narmin Al-Rashid',
    working_days: ['Sunday', 'Monday', 'Wednesday', 'Thursday', 'Saturday'],
    start_time: '10:00',
    end_time: '18:00',
    break_start: '13:00',
    break_end: '14:00',
    slot_duration_minutes: 30,
    is_active: true,
  },
  {
    id: 'doc-3',
    clinic_id: 'clinic-2',
    doctor_id: 'dr-ahmed',
    doctor_name: 'Dr. Ahmed Al-Malki',
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    start_time: '08:00',
    end_time: '16:00',
    break_start: '12:00',
    break_end: '13:00',
    slot_duration_minutes: 30,
    is_active: true,
  },
  {
    id: 'doc-4',
    clinic_id: 'clinic-2',
    doctor_id: 'dr-sara',
    doctor_name: 'Dr. Sara Al-Zahrani',
    working_days: ['Sunday', 'Tuesday', 'Thursday', 'Saturday'],
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 30,
    is_active: true,
  },
];

const arabicNames = [
  'Ahmed Al-Rashid', 'Mohammed Al-Qahtani', 'Fatima Al-Harbi', 'Abdullah Al-Otaibi',
  'Nora Al-Ghamdi', 'Khalid Al-Shehri', 'Sara Al-Malki', 'Omar Al-Anzi',
  'Lina Al-Zahrani', 'Yousef Al-Dossari', 'Reem Al-Bogami', 'Tariq Al-Mutairi',
  'Haya Al-Qahtani', 'Saleh Al-Shamrani', 'Mona Al-Asmari', 'Faisal Al-Bishi',
  'Dalal Al-Subaie', 'Hamad Al-Jaber', 'Rana Al-Marzouqi', 'Sultan Al-Harthy',
];
const englishNames = [
  'John Smith', 'Sarah Johnson', 'Michael Davis', 'Emily Wilson', 'James Brown',
  'Jessica Taylor', 'Robert Anderson', 'Ashley Thomas', 'William Jackson', 'Samantha White',
  'David Harris', 'Amanda Martin', 'Richard Thompson', 'Stephanie Garcia', 'Joseph Martinez',
  'Nicole Robinson', 'Charles Clark', 'Megan Lewis', 'Christopher Lee', 'Lauren Walker',
];

function saudiPhone(i: number) {
  return `96650${String(1000000 + i * 137).slice(0, 7)}`;
}

export const MOCK_PATIENTS: Patient[] = [
  ...arabicNames.map((name, i) => ({
    phone: saudiPhone(i),
    name,
    language: 'ar' as const,
    current_flow: null,
    flow_step: 0,
    updated_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    total_appointments: Math.floor(Math.random() * 8) + 1,
    last_visit: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString().split('T')[0],
    status: 'active' as const,
  })),
  ...englishNames.map((name, i) => ({
    phone: saudiPhone(i + 20),
    name,
    language: 'en' as const,
    current_flow: null,
    flow_step: 0,
    updated_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    total_appointments: Math.floor(Math.random() * 6) + 1,
    last_visit: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString().split('T')[0],
    status: i % 7 === 0 ? 'inactive' as const : 'active' as const,
  })),
];

const treatments = ['Cleaning & Polishing', 'Fillings', 'Braces & Orthodontics', 'Teeth Whitening', 'Extraction', 'Dental Implants', 'Root Canal'];
const statuses: Appointment['status'][] = ['confirmed', 'confirmed', 'confirmed', 'pending', 'completed', 'completed', 'cancelled', 'no-show'];
const doctors = ['Dr. Marjuk Hasan', 'Dr. Narmin Al-Rashid', 'Dr. Ahmed Al-Malki', 'Dr. Sara Al-Zahrani'];

export const MOCK_APPOINTMENTS: Appointment[] = Array.from({ length: 200 }, (_, i) => {
  const daysAgo = Math.floor(Math.random() * 30) - 5;
  const date = new Date(Date.now() + daysAgo * 86400000);
  const isoDate = date.toISOString().split('T')[0];
  const patient = MOCK_PATIENTS[i % MOCK_PATIENTS.length];
  const hours = [9, 10, 11, 13, 14, 15, 16, 17][Math.floor(Math.random() * 8)];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayH = hours > 12 ? hours - 12 : hours;
  const timeSlot = `${displayH}:00 ${ampm}`;
  const status = daysAgo < 0 ? statuses[Math.floor(Math.random() * statuses.length)] : (daysAgo === 0 ? 'confirmed' : 'completed') as Appointment['status'];

  return {
    id: `appt-${i}`,
    phone: patient.phone,
    clinic_id: i % 3 === 0 ? 'clinic-2' : 'clinic-1',
    name: patient.name || 'Unknown',
    treatment: treatments[Math.floor(Math.random() * treatments.length)],
    description: '',
    preferred_date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    preferred_date_iso: isoDate,
    time_slot: timeSlot,
    doctor_name: doctors[Math.floor(Math.random() * doctors.length)],
    status,
    reminder_sent_24h: Math.random() > 0.4,
    reminder_sent_1h: Math.random() > 0.6,
    follow_up_sent: status === 'completed' ? Math.random() > 0.3 : false,
    created_at: new Date(date.getTime() - Math.random() * 7 * 86400000).toISOString(),
  };
});

export const MOCK_ACTIVITY: ActivityItem[] = [
  { id: '1', type: 'booking', message: 'New booking: Marjuk Hasan with Dr. Narmin, 10:30 AM', time: '2 min ago', patient: 'Marjuk Hasan' },
  { id: '2', type: 'reminder', message: 'Reminder sent to 966572914855', time: '15 min ago' },
  { id: '3', type: 'cancellation', message: 'Cancellation: Ahmed Al-Rashid, April 18', time: '1 hour ago', patient: 'Ahmed Al-Rashid' },
  { id: '4', type: 'booking', message: 'New booking: Sara Al-Zahrani with Dr. Marjuk, 2:00 PM', time: '2 hours ago', patient: 'Sara Al-Zahrani' },
  { id: '5', type: 'no_show', message: 'No-show detected: Mohammed Al-Qahtani, 9:00 AM', time: '3 hours ago', patient: 'Mohammed Al-Qahtani' },
  { id: '6', type: 'reschedule', message: 'Rescheduled: Fatima Al-Harbi → April 22, 3:00 PM', time: '4 hours ago', patient: 'Fatima Al-Harbi' },
  { id: '7', type: 'booking', message: 'New booking: John Smith with Dr. Sara, 11:00 AM', time: '5 hours ago', patient: 'John Smith' },
  { id: '8', type: 'reminder', message: 'Follow-up sent to 96650123456', time: '6 hours ago' },
];

function last7Days(): { date: string; count: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return {
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      count: Math.floor(Math.random() * 15) + 5,
    };
  });
}

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  appointments_today: 12,
  pending: 3,
  revenue: 18500,
  no_show_rate: 8,
  new_patients: 24,
  appointments_trend: last7Days(),
  treatment_breakdown: [
    { name: 'Cleaning & Polishing', value: 35, color: '#3B82F6' },
    { name: 'Fillings', value: 22, color: '#10B981' },
    { name: 'Braces', value: 15, color: '#F59E0B' },
    { name: 'Whitening', value: 12, color: '#8B5CF6' },
    { name: 'Extraction', value: 10, color: '#EF4444' },
    { name: 'Other', value: 6, color: '#6B7280' },
  ],
  peak_hours: [
    { hour: '9 AM', count: 8 },
    { hour: '10 AM', count: 14 },
    { hour: '11 AM', count: 12 },
    { hour: '12 PM', count: 5 },
    { hour: '1 PM', count: 6 },
    { hour: '2 PM', count: 11 },
    { hour: '3 PM', count: 13 },
    { hour: '4 PM', count: 10 },
    { hour: '5 PM', count: 7 },
  ],
};

export const MOCK_LEADS: any[] = [
  {
    id: 'lead-1',
    phone: '966501112223',
    name: 'Ahmed Al-Farsi',
    source: 'Instagram Ad',
    category: 'Dental Implants',
    status: 'new',
    confidence_score: 92,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'lead-2',
    phone: '966504445556',
    name: 'Sarah Wilson',
    source: 'Google Search',
    category: 'Invisalign',
    status: 'contacted',
    confidence_score: 85,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    last_contacted_at: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    id: 'lead-3',
    phone: '966507778889',
    name: 'Khalid Mohammed',
    source: 'Facebook Campaign',
    category: 'General Checkup',
    status: 'appointment_booked',
    confidence_score: 98,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'lead-4',
    phone: '966509990001',
    name: 'Emma Thompson',
    source: 'Referral',
    category: 'Teeth Whitening',
    status: 'lost',
    confidence_score: 45,
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'lead-5',
    phone: '966501239876',
    name: 'Yousef Nasser',
    source: 'Direct WhatsApp',
    category: 'Emergency Pain',
    status: 'new',
    confidence_score: 100,
    created_at: new Date(Date.now() - 600000).toISOString(),
  }
];
