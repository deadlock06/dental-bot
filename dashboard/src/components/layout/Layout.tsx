import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '../../hooks/useAuth';

export default function Layout() {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState('clinic-1');

  if (!isAuthenticated) {
    return <Navigate to="/dashboard/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onMobileMenuToggle={() => setMobileOpen(!mobileOpen)}
          selectedClinic={selectedClinic}
          onClinicChange={setSelectedClinic}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6">
            <Outlet context={{ selectedClinic }} />
          </div>
        </main>
      </div>
    </div>
  );
}
