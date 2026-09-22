import { SITE_INFO } from '../data/menu';
import { IconClock, IconRefresh } from './Icons';

export default function Hero({ openStatus, onOrderClick, onOrderAgain, hasLastOrder }) {
  return (
    <section className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
        <span className="aurora aurora--a" />
        <span className="aurora aurora--b" />
        <span className="hero-grain" />
        <span className="hero-particles">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="particle" style={{ '--i': i }} />
          ))}
        </span>
      </div>

      <div className="hero-inner">
        <p className="hero-eyebrow">מזנון שכונתי · אוכל טרי כל יום</p>
        <h1 className="hero-title">
          המזנון של הקרון
          <span className="hero-title-rule" aria-hidden="true" />
        </h1>
        <p className="hero-sub">
          כל בוקר אנחנו פותחים את הקרון, קוצצים ירקות טריים ומחממים את הפלנצ׳ה.
          כריך חם, טוסט פריך או צלחת נדיבה — הכול מוכן ברגע שאתם מזמינים.
        </p>

        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onOrderClick}>
            מזמינים עכשיו
          </button>
          {hasLastOrder && (
            <button className="btn btn-ghost btn-lg" onClick={onOrderAgain}>
              <IconRefresh size={16} /> הזמינו שוב
            </button>
          )}
        </div>

        <div className="hero-meta">
          <div className="hero-meta-item">
            <span className={`status-dot ${openStatus.isOpen ? 'is-open' : 'is-closed'}`} />
            {openStatus.text}
          </div>
          <div className="hero-meta-item">
            <IconClock size={15} /> זמן הכנה משוער {SITE_INFO.prepTimeMinutes} דק׳
          </div>
        </div>
      </div>

      <div className="hero-strip">
        <div className="hero-strip-track">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i}>טרי, חם ומוכן במיוחד בשבילכם</span>
          ))}
        </div>
      </div>
    </section>
  );
}
