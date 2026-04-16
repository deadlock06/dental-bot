import React, { useState } from 'react';
import { Search, Plus, Edit, Pause, Eye, CheckCircle, XCircle, MapPin, Phone, Users } from 'lucide-react';
import { MOCK_CLINICS, MOCK_APPOINTMENTS } from '../lib/mockData';
import { cn, getStatusColor } from '../lib/utils';

export default function Clinics() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filtered = MOCK_CLINICS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const getApptCount = (clinicId: string) =>
    MOCK_APPOINTMENTS.filter(a => a.clinic_id === clinicId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clinics</h1>
          <p className="text-slate-500 text-sm mt-0.5">{MOCK_CLINICS.length} clinics registered</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Clinic
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clinics..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
        />
      </div>

      {/* Clinic Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(clinic => (
          <div key={clinic.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  {clinic.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{clinic.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', getStatusColor(clinic.plan))}>
                      {clinic.plan.toUpperCase()}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', getStatusColor(clinic.status))}>
                      {clinic.status === 'active' ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors" title="Edit">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors" title="View">
                  <Eye className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-amber-50 rounded-lg text-slate-400 hover:text-amber-600 transition-colors" title="Pause">
                  <Pause className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span>{clinic.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-blue-500 hover:underline cursor-pointer">+{clinic.whatsapp_number}</span>
              </div>
              {clinic.staff_phone && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>Staff: +{clinic.staff_phone}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">{getApptCount(clinic.id)}</div>
                <div className="text-xs text-slate-400">Appointments</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">
                  {clinic.id === 'clinic-1' ? 2 : 2}
                </div>
                <div className="text-xs text-slate-400">Doctors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-600">
                  {clinic.config?.features?.reschedule ? (
                    <CheckCircle className="w-5 h-5 mx-auto" />
                  ) : (
                    <XCircle className="w-5 h-5 mx-auto text-red-400" />
                  )}
                </div>
                <div className="text-xs text-slate-400">Full Features</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Clinic Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add New Clinic</h2>
            <div className="space-y-4">
              {[
                { label: 'Clinic Name', placeholder: 'e.g. Al-Noor Dental Clinic', type: 'text' },
                { label: 'WhatsApp Number', placeholder: 'e.g. 14155238886', type: 'text' },
                { label: 'Location', placeholder: 'e.g. Riyadh, Saudi Arabia', type: 'text' },
                { label: 'Staff Notification Number', placeholder: 'e.g. 966501234567', type: 'text' },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-sm font-medium text-slate-700 block mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              ))}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Plan</label>
                <select className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Create Clinic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
