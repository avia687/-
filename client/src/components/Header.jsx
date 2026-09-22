import { SITE_INFO } from '../data/menu';
import { IconBag } from './Icons';

export default function Header({ openStatus, cartCount, cartBump, onCartClick }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a href="#top" className="brand">
          <img src="/logo.svg" alt="" className="brand-logo" />
          <span className="brand-text">
            <span className="brand-name">{SITE_INFO.name}</span>
            <span className={`brand-status ${openStatus.isOpen ? 'is-open' : 'is-closed'}`}>
              <span className="status-dot" />
              {openStatus.text}
            </span>
          </span>
        </a>

        <nav className="site-nav">
          <a href="#menu">התפריט</a>
          <a href="#faq">שאלות נפוצות</a>
          <a href="#contact">יצירת קשר</a>
        </nav>

        <button
          className={`cart-btn ${cartBump ? 'cart-btn--bump' : ''}`}
          onClick={onCartClick}
          aria-label={`פתח סל הזמנות, ${cartCount} פריטים`}
        >
          <IconBag size={17} />
          <span className="cart-btn-label">הסל שלי</span>
          {cartCount > 0 && <span className="cart-btn-count">{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}
