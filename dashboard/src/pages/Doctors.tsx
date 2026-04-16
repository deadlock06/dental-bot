import React, { useState } from 'react';
import { Edit, Plus, X, Check } from 'lucide-react';
import { MOCK_DOCTORS, MOCK_CLINICS } from '../lib/mockData';
import { cn } from '../lib/utils';
import type { Doctor } from '../types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };

const DOCTOR_COLORS = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-emerald-500 to-emerald-600',
  'from-amber-500 to-amber-600',
];

export default function Doctors() {
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctors</h1>
          <p className="text-slate-500 text-sm mt-0.5">{MOCK_DOCTORS.length} doctors across {MOCK_CLINICS.length} clinics</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Doctor
        </button>
      </div>

      {/* Group by clinic */}
      {MOCK_CLINICS.map(clinic => {
        const clinicDoctors = MOCK_DOCTORS.filter(d => d.clinic_id === clinic.id);
        return (
          <div key={clinic.id}>
            <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              {clinic.name}
              <span className="text-xs font-normal text-slate-400">({clinicDoctors.length} doctors)</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {clinicDoctors.map((doc, i) => (
                <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm', DOCTOR_COLORS[i % DOCTOR_COLORS.length])}>
                        {doc.doctor_name.split(' ').slice(-1)[0].charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{doc.doctor_name}</h3>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full border font-medium',
                          doc.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                        )}>
                          {doc.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(doc)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Working Days */}
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Working Days</p>
                    <div className="flex gap-1 flex-wrap">
                      {DAYS.map(day => (
                        <span
                          key={day}
                          className={cn(
                            'text-xs px-2 py-1 rounded-lg font-medium',
                            doc.working_days.includes(day)
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-50 text-slate-300'
                          )}
                        >
                          {DAY_SHORT[day as keyof typeof DAY_SHORT]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Schedule Info */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-center">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{doc.start_time} – {doc.end_time}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Working Hours</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {doc.break_start ? `${doc.break_start} – ${doc.break_end}` : '—'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Break</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{doc.slot_duration_minutes} min</div>
                      <div className="text-xs text-slate-400 mt-0.5">Slot Duration</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Edit Schedule Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Edit Schedule — {editing.doctor_name}</h2>
              <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Working Days */}
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const active = editing.working_days.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => setEditing(prev => prev ? {
                          ...prev,
                          working_days: active
                            ? prev.working_days.filter(d => d !== day)
                            : [...prev.working_days, day]
                        } : null)}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                          active ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        )}
                      >
                        {DAY_SHORT[day as keyof typeof DAY_SHORT]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Start Time', key: 'start_time' },
                  { label: 'End Time', key: 'end_time' },
                  { label: 'Break Start', key: 'break_start' },
                  { label: 'Break End', key: 'break_end' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                    <input
                      type="time"
                      defaultValue={editing[f.key as keyof Doctor] as string || ''}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Slot Duration</label>
                <select
                  defaultValue={editing.slot_duration_minutes}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Active</span>
                <button
                  onClick={() => setEditing(prev => prev ? { ...prev, is_active: !prev.is_active } : null)}
                  className={cn(
                    'w-12 h-6 rounded-full transition-colors flex items-center px-1',
                    editing.is_active ? 'bg-emerald-500' : 'bg-slate-200'
                  )}
                >
                  <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform', editing.is_active && 'translate-x-6')} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
