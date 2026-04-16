import React, { useState } from 'react';
import { Save, Bell, Lock, Globe, MessageSquare, Clock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';

const tabs = ['Profile', 'Notifications', 'Clinic Settings', 'Custom Messages'] as const;
type Tab = typeof tabs[number];

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Profile');
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account and clinic configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'Profile' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Globe className="w-4 h-4 text-slate-400" /> Profile Info</h2>
          <div className="space-y-4">
            {[
              { label: 'Full Name', value: user?.name || '', type: 'text' },
              { label: 'Email Address', value: user?.email || '', type: 'email' },
              { label: 'Role', value: user?.role || '', type: 'text', disabled: true },
            ].map(f => (
              <div key={f.label}>
                <label className="text-sm font-medium text-slate-700 block mb-1">{f.label}</label>
                <input
                  type={f.type}
                  defaultValue={f.value}
                  disabled={f.disabled}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Lock className="w-4 h-4 text-slate-400" /> Change Password</h3>
            <div className="space-y-3">
              {['Current Password', 'New Password', 'Confirm New Password'].map(label => (
                <div key={label}>
                  <label className="text-sm font-medium text-slate-700 block mb-1">{label}</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'Notifications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-5"><Bell className="w-4 h-4 text-slate-400" /> Notification Preferences</h2>
          <div className="space-y-1">
            {[
              { label: 'New booking notification', desc: 'Get alerted when a patient books an appointment', on: true },
              { label: 'Cancellation alerts', desc: 'Notify when an appointment is cancelled', on: true },
              { label: 'No-show detection', desc: 'Alert when a patient misses their appointment', on: true },
              { label: 'Daily summary', desc: 'Receive a daily digest at 8AM', on: false },
              { label: 'WhatsApp notifications', desc: 'Send alerts to staff WhatsApp number', on: true },
              { label: 'Email reports', desc: 'Weekly performance report by email', on: false },
            ].map(item => (
              <Toggle key={item.label} label={item.label} desc={item.desc} defaultOn={item.on} />
            ))}
          </div>
        </div>
      )}

      {/* Clinic Settings Tab */}
      {activeTab === 'Clinic Settings' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> Clinic Configuration</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Opening Time</label>
                <input type="time" defaultValue="09:00" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Closing Time</label>
                <input type="time" defaultValue="18:00" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">24h Reminder (hours before)</label>
                <input type="number" defaultValue={24} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">1h Reminder (hours before)</label>
                <input type="number" defaultValue={1} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Review Link</label>
              <input type="url" defaultValue="https://g.page/r/alhala" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Google Maps Link</label>
              <input type="url" defaultValue="https://maps.google.com" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
        </div>
      )}

      {/* Custom Messages Tab */}
      {activeTab === 'Custom Messages' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-400" /> Custom WhatsApp Messages</h2>
          {[
            { label: 'Welcome Message (Arabic)', value: 'أهلاً وسهلاً في عيادة الهلال للأسنان! 😊' },
            { label: 'Booking Confirmation', value: 'تم تأكيد موعدك بنجاح! ✅' },
            { label: 'Reminder Message', value: 'تذكير: لديك موعد غداً في الساعة {time}.' },
            { label: 'Cancellation Acknowledgment', value: 'تم إلغاء موعدك. نتمنى أن نراك قريباً! 😊' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-sm font-medium text-slate-700 block mb-1">{f.label}</label>
              <textarea
                defaultValue={f.value}
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all',
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm'
          )}
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, desc, defaultOn }: { label: string; desc: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-50 last:border-b-0">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        className={cn(
          'w-11 h-6 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0',
          on ? 'bg-blue-500' : 'bg-slate-200'
        )}
      >
        <div className={cn('w-5 h-5 bg-white rounded-full shadow transition-transform', on && 'translate-x-5')} />
      </button>
    </div>
  );
}
