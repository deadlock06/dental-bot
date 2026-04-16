import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, List, Plus, Check, X, Clock, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { MOCK_APPOINTMENTS } from '../lib/mockData';
import { cn, getStatusColor, formatDate } from '../lib/utils';
import type { Appointment } from '../types';

const STATUS_FILTERS = ['All', 'confirmed', 'pending', 'cancelled', 'completed', 'no-show'];

type ViewMode = 'list' | 'calendar';

const StatusBadge = ({ status }: { status: Appointment['status'] }) => (
  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', getStatusColor(status))}>
    {status}
  </span>
);

export default function Appointments() {
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const PER_PAGE = 15;

  const filtered = useMemo(() => {
    return MOCK_APPOINTMENTS.filter(a => {
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.phone.includes(search) ||
        a.treatment.toLowerCase().includes(search.toLowerCase()) ||
        (a.doctor_name || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || a.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => (b.preferred_date_iso || '').localeCompare(a.preferred_date_iso || ''));
  }, [search, statusFilter]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // Calendar view — group by date
  const today = new Date().toISOString().split('T')[0];
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 3 + i);
    return d.toISOString().split('T')[0];
  });

  const apptsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    MOCK_APPOINTMENTS.forEach(a => {
      const d = a.preferred_date_iso || '';
      if (!map[d]) map[d] = [];
      map[d].push(a);
    });
    return map;
  }, []);

  const doctorColors: Record<string, string> = {
    'Dr. Marjuk Hasan': 'bg-blue-100 text-blue-700 border-blue-200',
    'Dr. Narmin Al-Rashid': 'bg-purple-100 text-purple-700 border-purple-200',
    'Dr. Ahmed Al-Malki': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Dr. Sara Al-Zahrani': 'bg-amber-100 text-amber-700 border-amber-200',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} appointments found</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Appointment
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search patient, doctor, treatment..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize',
                statusFilter === s
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex border border-slate-200 rounded-lg overflow-hidden ml-auto">
          <button
            onClick={() => setView('list')}
            className={cn('px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors', view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            onClick={() => setView('calendar')}
            className={cn('px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors', view === 'calendar' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
          >
            <Calendar className="w-3.5 h-3.5" /> Week
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <>
          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Patient</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Date & Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Treatment</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Doctor</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginated.map(appt => (
                    <tr
                      key={appt.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedAppt(appt)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{appt.name}</div>
                        <div className="text-xs text-slate-400">{appt.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{appt.preferred_date_iso}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{appt.time_slot}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-slate-700">{appt.treatment}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full border', doctorColors[appt.doctor_name || ''] || 'bg-gray-100 text-gray-600 border-gray-200')}>
                          {appt.doctor_name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={appt.status} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1.5 hover:bg-emerald-50 rounded text-slate-400 hover:text-emerald-600 transition-colors" title="Confirm">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors" title="Reminder">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors" title="Cancel">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs px-2 text-slate-600">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Calendar View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100">
            {weekDays.map(d => {
              const date = new Date(d + 'T00:00:00');
              const isToday = d === today;
              return (
                <div key={d} className={cn('py-3 text-center border-r last:border-r-0 border-slate-100', isToday && 'bg-blue-50')}>
                  <div className="text-xs text-slate-400 uppercase">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className={cn('text-lg font-bold mt-0.5', isToday ? 'text-blue-500' : 'text-slate-800')}>{date.getDate()}</div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 min-h-64">
            {weekDays.map(d => {
              const dayAppts = (apptsByDate[d] || []).slice(0, 5);
              const isToday = d === today;
              return (
                <div key={d} className={cn('p-2 border-r last:border-r-0 border-slate-100 min-h-48', isToday && 'bg-blue-50/30')}>
                  <div className="space-y-1">
                    {dayAppts.map(a => (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAppt(a)}
                        className={cn('px-2 py-1 rounded text-xs truncate cursor-pointer border', doctorColors[a.doctor_name || ''] || 'bg-gray-100 text-gray-600 border-gray-200')}
                        title={`${a.time_slot} — ${a.name}`}
                      >
                        <div className="font-medium">{a.time_slot}</div>
                        <div className="truncate">{a.name}</div>
                      </div>
                    ))}
                    {(apptsByDate[d] || []).length > 5 && (
                      <div className="text-xs text-slate-400 pl-2">+{(apptsByDate[d] || []).length - 5} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointment Detail Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Appointment Details</h2>
              <button onClick={() => setSelectedAppt(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Patient', value: selectedAppt.name },
                { label: 'Phone', value: selectedAppt.phone },
                { label: 'Treatment', value: selectedAppt.treatment },
                { label: 'Doctor', value: selectedAppt.doctor_name || '—' },
                { label: 'Date', value: selectedAppt.preferred_date_iso || '' },
                { label: 'Time', value: selectedAppt.time_slot },
                { label: 'Status', value: selectedAppt.status, badge: true },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-slate-400">{row.label}</span>
                  {row.badge ? (
                    <StatusBadge status={selectedAppt.status} />
                  ) : (
                    <span className="font-medium text-slate-800">{row.value}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">Cancel Appt</button>
              <button className="flex-1 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600">Send Reminder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
