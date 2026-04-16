import React, { useState, useMemo } from 'react';
import { Search, Phone, Calendar, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { MOCK_PATIENTS, MOCK_APPOINTMENTS } from '../lib/mockData';
import { cn, getStatusColor, formatRelativeTime } from '../lib/utils';
import type { Patient } from '../types';

export default function Patients() {
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'ar' | 'en'>('all');
  const [selected, setSelected] = useState<Patient | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const filtered = useMemo(() => {
    return MOCK_PATIENTS.filter(p => {
      const matchSearch = !search ||
        (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        p.phone.includes(search);
      const matchLang = langFilter === 'all' || p.language === langFilter;
      return matchSearch && matchLang;
    });
  }, [search, langFilter]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const getPatientAppointments = (phone: string) =>
    MOCK_APPOINTMENTS.filter(a => a.phone === phone).sort(
      (a, b) => (b.preferred_date_iso || '').localeCompare(a.preferred_date_iso || '')
    );

  const patientAppts = selected ? getPatientAppointments(selected.phone) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-slate-500 text-sm mt-0.5">{MOCK_PATIENTS.length} total registered</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or phone..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'ar', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => { setLangFilter(l); setPage(1); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                langFilter === l ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              )}
            >
              {l === 'all' ? 'All' : l === 'ar' ? '🇸🇦 Arabic' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Patients', value: MOCK_PATIENTS.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Arabic Speaking', value: MOCK_PATIENTS.filter(p => p.language === 'ar').length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active', value: MOCK_PATIENTS.filter(p => p.status === 'active').length, color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map(stat => (
          <div key={stat.label} className={cn('rounded-xl p-4 text-center', stat.bg)}>
            <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden sm:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Language</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Appointments</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Last Visit</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.map((patient, i) => (
                <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(patient)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {(patient.name || '?').charAt(0)}
                      </div>
                      <div className="font-medium text-slate-900">{patient.name || '—'}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <a
                      href={`https://wa.me/${patient.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-blue-500 hover:underline flex items-center gap-1"
                    >
                      +{patient.phone} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span>{patient.language === 'ar' ? '🇸🇦 AR' : '🇬🇧 EN'}</span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span className="font-semibold text-slate-800">{patient.total_appointments || 0}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-slate-600">{patient.last_visit || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', getStatusColor(patient.status || 'active'))}>
                      {patient.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors" title="WhatsApp">
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors" title="History">
                        <Calendar className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs px-2 text-slate-600">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Patient Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold">
                  {(selected.name || '?').charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">{selected.name}</h2>
                  <p className="text-xs text-slate-400">+{selected.phone}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 mb-5">
              {[
                { label: 'Language', value: selected.language === 'ar' ? '🇸🇦 Arabic' : '🇬🇧 English' },
                { label: 'Status', value: selected.status || 'active' },
                { label: 'Appointments', value: String(selected.total_appointments || 0) },
                { label: 'Last Visit', value: selected.last_visit || '—' },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-2 border-b border-slate-50 text-sm">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="font-medium text-slate-800">{r.value}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold text-slate-800 text-sm mb-2">Appointment History</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {patientAppts.length === 0 ? (
                <p className="text-xs text-slate-400">No appointments found</p>
              ) : patientAppts.map(a => (
                <div key={a.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                  <div>
                    <div className="font-medium text-slate-800">{a.treatment}</div>
                    <div className="text-slate-400">{a.preferred_date_iso} · {a.time_slot}</div>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full border capitalize', getStatusColor(a.status))}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>

            <button className="w-full mt-4 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
              Book New Appointment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
