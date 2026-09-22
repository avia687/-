import { SITE_INFO } from '../data/menu';

export default function WhatsAppFab() {
  const href = `https://wa.me/${SITE_INFO.whatsapp}?text=${encodeURIComponent('היי! רציתי לשאול לגבי המזנון 🙂')}`;
  return (
    <a
      href={href}
      className="wa-fab"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="שלחו לנו הודעה בוואטסאפ"
    >
      💬
    </a>
  );
}
