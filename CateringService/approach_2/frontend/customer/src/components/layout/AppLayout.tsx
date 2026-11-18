import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Navbar } from './Navbar';
import { GlobalFeedbackBanner } from './GlobalFeedbackBanner';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <GlobalFeedbackBanner />
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="mb-2 flex justify-center gap-4">
          <Link to="/terms" className="hover:underline text-slate-600">Terms of Service</Link>
          <Link to="/privacy" className="hover:underline text-slate-600">Privacy Policy</Link>
          <Link to="/refund-policy" className="hover:underline text-slate-600">Refund Policy</Link>
        </div>
        <div>CaterConnect &copy; 2026. Pan-India Catering &amp; Event Feast Marketplace.</div>
      </footer>
    </div>
  );
};
