import React, { useState } from 'react';
import { Download, Calendar } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, FunnelChart, Funnel, LabelList
} from 'recharts';
import { MOCK_DASHBOARD_STATS, MOCK_APPOINTMENTS } from '../lib/mockData';
import { cn } from '../lib/utils';
import type { Period } from '../types';

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
];

const DOCTOR_UTILIZATION = [
  { name: 'Dr. Marjuk', value: 87, color: '#3B82F6' },
  { name: 'Dr. Narmin', value: 74, color: '#8B5CF6' },
  { name: 'Dr. Ahmed', value: 91, color: '#10B981' },
  { name: 'Dr. Sara', value: 62, color: '#F59E0B' },
];

const REVENUE_DATA = [
  { treatment: 'Cleaning', revenue: 4200 },
  { treatment: 'Fillings', revenue: 6800 },
  { treatment: 'Braces', revenue: 9500 },
  { treatment: 'Whitening', revenue: 3200 },
  { treatment: 'Extraction', revenue: 2100 },
  { treatment: 'Implants', revenue: 12000 },
];

const NOSHOW_TREND = [
  { week: 'Week 1', rate: 12 },
  { week: 'Week 2', rate: 9 },
  { week: 'Week 3', rate: 11 },
  { week: 'Week 4', rate: 7 },
  { week: 'Week 5', rate: 8 },
  { week: 'Week 6', rate: 5 },
];

const FUNNEL_DATA = [
  { name: 'Bot Interactions', value: 450, fill: '#3B82F6' },
  { name: 'Started Booking', value: 280, fill: '#6366F1' },
  { name: 'Slot Selected', value: 210, fill: '#8B5CF6' },
  { name: 'Confirmed', value: 178, fill: '#10B981' },
  { name: 'Completed', value: 152, fill: '#059669' },
];

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('30d');

  const stats = MOCK_DASHBOARD_STATS;

  // Build trend data based on period
  const trendDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const trendData = Array.from({ length: Math.min(trendDays, 30) }, (_, i) => {
    const d = new Date(Date.now() - (trendDays - 1 - i) * 86400000);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      appointments: Math.floor(Math.random() * 15) + 3,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Performance overview and insights</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period switcher */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  period === p.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Appointments', value: period === '7d' ? 87 : period === '30d' ? 342 : 891, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Revenue (SAR)', value: period === '7d' ? '18,500' : period === '30d' ? '71,200' : '198,500', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Avg No-Show Rate', value: '8%', color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'New Patients', value: period === '7d' ? 12 : period === '30d' ? 47 : 124, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl p-4', s.bg)}>
            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Appointments Trend</h2>
            <p className="text-xs text-slate-400">Daily volume over selected period</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
              interval={Math.floor(trendData.length / 6)} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Line type="monotone" dataKey="appointments" stroke="#3B82F6" strokeWidth={2.5}
              dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue by Treatment + Doctor Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Revenue by Treatment</h2>
          <p className="text-xs text-slate-400 mb-4">SAR earnings breakdown</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={REVENUE_DATA} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="treatment" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={70} />
              <Tooltip
                formatter={(v: any) => [`SAR ${Number(v).toLocaleString()}`, 'Revenue']}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Doctor Utilization</h2>
          <p className="text-xs text-slate-400 mb-4">% of available slots booked</p>
          <div className="space-y-4 py-2">
            {DOCTOR_UTILIZATION.map(doc => (
              <div key={doc.name}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">{doc.name}</span>
                  <span className="font-bold" style={{ color: doc.color }}>{doc.value}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${doc.value}%`, backgroundColor: doc.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* No-Show Trend + Patient Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">No-Show Rate Trend</h2>
          <p className="text-xs text-slate-400 mb-4">Weekly no-show percentage</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={NOSHOW_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v: any) => [`${v}%`, 'No-show rate']} />
              <Line type="monotone" dataKey="rate" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Patient Acquisition Funnel</h2>
          <p className="text-xs text-slate-400 mb-4">From WhatsApp interaction to completed visit</p>
          <div className="space-y-2">
            {FUNNEL_DATA.map((item, i) => {
              const pct = Math.round((item.value / FUNNEL_DATA[0].value) * 100);
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 w-32 truncate">{item.name}</div>
                  <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${pct}%`, backgroundColor: item.fill }}
                    >
                      <span className="text-white text-xs font-bold">{item.value}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 w-10 text-right">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
