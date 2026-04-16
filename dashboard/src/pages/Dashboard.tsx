import React from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Calendar, Users, TrendingUp, AlertTriangle, UserPlus,
  Plus, Send, Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { MOCK_DASHBOARD_STATS, MOCK_ACTIVITY } from '../lib/mockData';
import { cn, formatCurrency } from '../lib/utils';

const METRIC_CARDS = [
  {
    label: 'Appointments Today',
    key: 'appointments_today' as const,
    icon: Calendar,
    color: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    change: '+12%',
    up: true,
  },
  {
    label: 'Pending Confirmations',
    key: 'pending' as const,
    icon: Clock,
    color: 'from-amber-500 to-amber-600',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    change: '-5%',
    up: false,
  },
  {
    label: 'Revenue This Month',
    key: 'revenue' as const,
    icon: TrendingUp,
    color: 'from-emerald-500 to-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    change: '+23%',
    up: true,
    format: 'currency',
  },
  {
    label: 'No-Show Rate',
    key: 'no_show_rate' as const,
    icon: AlertTriangle,
    color: 'from-red-500 to-red-600',
    bg: 'bg-red-50',
    text: 'text-red-600',
    change: '-2%',
    up: false,
    format: 'percent',
  },
  {
    label: 'New Patients',
    key: 'new_patients' as const,
    icon: UserPlus,
    color: 'from-purple-500 to-purple-600',
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    change: '+8%',
    up: true,
  },
];

const ACTIVITY_ICONS: Record<string, { color: string; icon: typeof Calendar }> = {
  booking: { color: 'bg-emerald-100 text-emerald-600', icon: Calendar },
  cancellation: { color: 'bg-red-100 text-red-600', icon: AlertTriangle },
  reminder: { color: 'bg-blue-100 text-blue-600', icon: Send },
  reschedule: { color: 'bg-amber-100 text-amber-600', icon: Clock },
  no_show: { color: 'bg-gray-100 text-gray-600', icon: AlertTriangle },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs shadow-xl">
        <p className="font-medium">{label}</p>
        <p className="text-blue-300">{payload[0].value} appointments</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const stats = MOCK_DASHBOARD_STATS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Broadcast</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Appointment</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {METRIC_CARDS.map(card => {
          const Icon = card.icon;
          const value = stats[card.key];
          const displayValue =
            card.format === 'currency'
              ? formatCurrency(value as number)
              : card.format === 'percent'
              ? `${value}%`
              : value;

          return (
            <div key={card.key} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', card.bg)}>
                  <Icon className={cn('w-4 h-4', card.text)} />
                </div>
                <span className={cn(
                  'text-xs font-medium flex items-center gap-0.5',
                  card.up ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {card.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{displayValue}</div>
              <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Appointments Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Appointments (Last 7 Days)</h2>
              <p className="text-xs text-slate-400">Daily booking volume</p>
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-medium">+18% vs last week</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.appointments_trend} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Treatment Pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Popular Treatments</h2>
            <p className="text-xs text-slate-400">This month's breakdown</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={stats.treatment_breakdown}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {stats.treatment_breakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [`${value}%`, String(name)]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {stats.treatment_breakdown.slice(0, 4).map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 truncate max-w-[110px]">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak Hours + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Peak Hours Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Peak Booking Hours</h2>
            <p className="text-xs text-slate-400">Average appointments per hour</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.peak_hours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Line
                type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2.5}
                dot={{ fill: '#3B82F6', r: 3 }} activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent Activity</h2>
            <button className="text-xs text-blue-500 hover:underline">View all</button>
          </div>
          <div className="space-y-3">
            {MOCK_ACTIVITY.slice(0, 6).map(item => {
              const config = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.booking;
              const Icon = config.icon;
              return (
                <div key={item.id} className="flex items-start gap-3">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', config.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 leading-snug">{item.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
