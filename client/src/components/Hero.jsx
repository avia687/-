import { SITE_INFO } from '../data/menu';
import FoodArt from './FoodArt';

export default function Hero({ openStatus, onOrderClick, onOrderAgain, hasLastOrder }) {
  return (
    <section className="hero" id="top">
      <div className="hero-blob hero-blob--a" aria-hidden="true" />
      <div className="hero-blob hero-blob--b" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow">מזנון שכונתי · אוכל טרי כל יום</p>
          <h1 className="hero-title">
            המזנון של הקרון —<br />
            <span className="hero-title-accent">כריכים וטוסטים שמכינים באהבה</span>
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
                ↻ הזמינו שוב
              </button>
            )}
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <span className={`status-dot ${openStatus.isOpen ? 'is-open' : 'is-closed'}`} />
              {openStatus.text}
            </div>
            <div className="hero-meta-item">⏱ זמן הכנה משוער {SITE_INFO.prepTimeMinutes} דק׳</div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-plate hero-plate--main">
            <FoodArt id="shakshuka" size={210} />
          </div>
          <div className="hero-plate hero-plate--float1">
            <FoodArt id="avocado" size={92} />
          </div>
          <div className="hero-plate hero-plate--float2">
            <FoodArt id="toast" size={92} />
          </div>
        </div>
      </div>

      <div className="hero-strip">
        <div className="hero-strip-track">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i}>✦ טרי, חם ומוכן במיוחד בשבילכם</span>
          ))}
        </div>
      </div>
    </section>
  );
}
