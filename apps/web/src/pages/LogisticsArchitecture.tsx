import React from 'react';

export const LogisticsArchitecture: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* Hero Section */}
        <header className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full uppercase tracking-wide">
            Gate 2 — Foundation
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            Vansha Logistic Hub
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            From Order to Delivery — One Intelligent Logistics Platform
          </p>
        </header>

        {/* System Architecture Grid */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-800">System Architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Web Frontend</h3>
              <p className="text-sm text-slate-600">React + Vite + TypeScript</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Backend Services</h3>
              <p className="text-sm text-slate-600">Node.js + TypeScript (Versioned REST API)</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Database & Cache</h3>
              <p className="text-sm text-slate-600">PostgreSQL with Redis caching</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Mobile App</h3>
              <p className="text-sm text-slate-600">React Native + Expo</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Multi-Tenancy</h3>
              <p className="text-sm text-slate-600">Tenant-scoped authorization & data access</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-blue-600 mb-2">Security & Governance</h3>
              <p className="text-sm text-slate-600">RBAC, auditability, secure configuration</p>
            </div>
          </div>
        </section>

        {/* Repository Structure */}
        <section className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-md space-y-3">
          <h2 className="text-xl font-bold text-white">Repository Structure</h2>
          <pre className="bg-slate-950 p-4 rounded-lg text-emerald-400 font-mono text-sm overflow-x-auto">
{`apps/
  web/       # React Web App
  server/    # Node.js API Server
  mobile/    # React Native App
packages/
  shared/    # Shared Types & Utils
  config/    # Environment Config
database/
  migrations/`}
          </pre>
        </section>

        {/* Scope Notice */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900 space-y-2">
          <h3 className="font-bold text-lg">Current Gate Scope</h3>
          <p className="text-sm text-amber-800">
            Gate 2 establishes repository boundaries and foundation conventions only.
            Business modules (CRM, Fleet, Dispatch, Trips, GPS, Finance, AI) will be implemented in subsequent gates.
          </p>
        </section>

      </div>
    </div>
  );
};

export default LogisticsArchitecture;