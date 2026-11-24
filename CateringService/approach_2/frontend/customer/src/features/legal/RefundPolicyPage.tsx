import React from 'react';

export const RefundPolicyPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-4">Refund &amp; Cancellation Policy</h1>
      <p className="text-slate-600 mb-4">CaterConnect provides a clear and fair cancellation and refund mechanism for events.</p>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Cancellation Timelines</h2>
        <p className="text-slate-600">Cancellations made within eligible windows will receive refunds in accordance with caterer and platform policies.</p>
      </section>
    </div>
  );
};
