import React, { useState } from 'react';
import { Bell, ChevronDown, Menu, LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { MOCK_CLINICS } from '../../lib/mockData';
import { cn } from '../../lib/utils';

interface TopBarProps {
  onMobileMenuToggle: () => void;
  selectedClinic: string;
  onClinicChange: (id: string) => void;
}

export default function TopBar({ onMobileMenuToggle, selectedClinic, onClinicChange }: TopBarProps) {
  const { user, logout } = useAuth();
  const [clinicOpen, setClinicOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasNewNotif] = useState(true);

  const clinic = MOCK_CLINICS.find(c => c.id === selectedClinic) || MOCK_CLINICS[0];

  const notifications = [
    { id: 1, msg: 'New booking: Ahmed Al-Rashid, 10:30 AM', time: '2m ago', type: 'booking' },
    { id: 2, msg: 'Cancellation: Sarah Johnson, April 20', time: '15m ago', type: 'cancel' },
    { id: 3, msg: 'Reminder sent to 3 patients', time: '1h ago', type: 'reminder' },
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left: Hamburger + Clinic Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Clinic Selector */}
        <div className="relative">
          <button
            onClick={() => { setClinicOpen(!clinicOpen); setProfileOpen(false); setNotifOpen(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="max-w-[160px] truncate">{clinic.name}</span>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', clinicOpen && 'rotate-180')} />
          </button>

          {clinicOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Switch Clinic</div>
              {MOCK_CLINICS.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onClinicChange(c.id); setClinicOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors',
                    c.id === selectedClinic && 'bg-blue-50 text-blue-700'
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', c.status === 'active' ? 'bg-emerald-400' : 'bg-slate-300')} />
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.plan.toUpperCase()} plan</div>
                  </div>
                  {c.id === selectedClinic && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Notifications + Profile */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); setClinicOpen(false); }}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {hasNewNotif && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-800">Notifications</span>
                <span className="text-xs text-blue-500 hover:underline cursor-pointer">Mark all read</span>
              </div>
              {notifications.map(n => (
                <div key={n.id} className={cn(
                  'flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer',
                )}>
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    n.type === 'booking' ? 'bg-emerald-400' : n.type === 'cancel' ? 'bg-red-400' : 'bg-blue-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">{n.msg}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2.5 text-center">
                <button className="text-xs text-blue-500 hover:underline">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); setClinicOpen(false); }}
            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-slate-700 leading-none">{user?.name}</div>
              <div className="text-xs text-slate-400 mt-0.5 capitalize">{user?.role}</div>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 hidden sm:block transition-transform', profileOpen && 'rotate-180')} />
          </button>

          {profileOpen && (
            <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-sm font-medium text-slate-800">{user?.name}</div>
                <div className="text-xs text-slate-400">{user?.email}</div>
              </div>
              <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                <User className="w-4 h-4" /> Profile
              </button>
              <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                <Settings className="w-4 h-4" /> Settings
              </button>
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(clinicOpen || profileOpen || notifOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setClinicOpen(false); setProfileOpen(false); setNotifOpen(false); }}
        />
      )}
    </header>
  );
}
