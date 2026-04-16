import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(timeStr: string): string {
  return timeStr;
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(amount);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
    completed: 'bg-blue-100 text-blue-700 border-blue-200',
    'no-show': 'bg-gray-100 text-gray-600 border-gray-200',
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    inactive: 'bg-gray-100 text-gray-600 border-gray-200',
    pro: 'bg-purple-100 text-purple-700 border-purple-200',
    basic: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200';
}

export function getTodaysAppointments(appointments: import('../types').Appointment[]) {
  const today = new Date().toISOString().split('T')[0];
  return appointments.filter(a => a.preferred_date_iso === today);
}

export function truncate(str: string, len = 30): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
