import React from 'react';

export const TermsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p className="text-slate-600 mb-4">Welcome to CaterConnect. By using our platform, you agree to these Terms of Service.</p>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Overview</h2>
        <p className="text-slate-600">CaterConnect is a Pan-India marketplace connecting event hosts with verified caterers.</p>
      </section>
    </div>
  );
};
