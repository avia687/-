import { SITE_INFO } from '../data/menu';
import { IconPin, IconPhone, IconChat } from './Icons';

export default function Footer() {
  const waHref = `https://wa.me/${SITE_INFO.whatsapp}?text=${encodeURIComponent('היי! רציתי לשאול לגבי המזנון')}`;

  return (
    <footer className="site-footer" id="contact">
      <div className="footer-inner">
        <div className="footer-col">
          <div className="brand">
            <img src="/logo.svg" alt="" className="brand-logo" />
            <span className="brand-name">המזנון של הקרון</span>
          </div>
          <p className="footer-tagline">{SITE_INFO.tagline}</p>
        </div>

        <div className="footer-col">
          <h4>יצירת קשר</h4>
          <p><IconPin size={14} /> {SITE_INFO.address}</p>
          <p dir="ltr" className="footer-phone"><IconPhone size={14} /> {SITE_INFO.phoneDisplay}</p>
          <a href={waHref} className="footer-wa" target="_blank" rel="noopener noreferrer">
            <IconChat size={14} /> שלחו לנו הודעת וואטסאפ
          </a>
        </div>

        <div className="footer-col">
          <h4>שעות פעילות</h4>
          {SITE_INFO.hours.map(h => (
            <p key={h.days}>
              {h.days}: {h.open ? `${h.open}–${h.close}` : 'סגור'}
            </p>
          ))}
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} המזנון של הקרון. כל הזכויות שמורות.</p>
      </div>
    </footer>
  );
}
