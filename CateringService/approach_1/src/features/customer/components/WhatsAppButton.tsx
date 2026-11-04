import React from 'react';
import { MessageSquare } from 'lucide-react';

interface Props {
  phone: string;
  businessName: string;
  eventDate?: string;
}

export const WhatsAppButton: React.FC<Props> = ({ phone, businessName, eventDate }) => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const message = encodeURIComponent(
    `Hello ${businessName}, I am contacting you regarding catering services in Tirupati${
      eventDate ? ` for my event on ${eventDate}` : ''
    }.`
  );

  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      <span>Chat on WhatsApp</span>
    </a>
  );
};
