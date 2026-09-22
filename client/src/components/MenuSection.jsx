import { useMemo, useState } from 'react';
import { CATEGORIES } from '../data/menu';
import { getItemPriceLabel } from '../lib/orderUtils';
import { IconSearch, IconClose, IconHeart, IconHeartFilled } from './Icons';

const DIET_FILTERS = [
  { id: 'popular',    label: 'הכי אהוב' },
  { id: 'vegetarian', label: 'צמחוני' },
  { id: 'vegan',      label: 'טבעוני' },
  { id: 'spicy',      label: 'חריף' },
];

const TAG_LABELS = {
  popular: 'הכי אהוב',
  vegetarian: 'צמחוני',
  vegan: 'טבעוני',
  spicy: 'חריף',
};

function ItemRow({ item, isFavorite, onToggleFavorite, onOpen, delay }) {
  return (
    <article
      className="item-row"
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onOpen(item)}
      tabIndex={0}
      role="button"
      onKeyDown={e => { if (e.key === 'Enter') onOpen(item); }}
    >
      <div className="item-row-main">
        <div className="item-row-head">
          <h3 className="item-name">{item.name}</h3>
          <span className="item-row-leader" aria-hidden="true" />
          <span className="item-price">{getItemPriceLabel(item)}</span>
        </div>
        <p className="item-desc">{item.desc}</p>
        {item.tags.length > 0 && (
          <div className="item-tags">
            {item.tags.map(t => (
              <span key={t} className={`tag tag--${t}`}>{TAG_LABELS[t]}</span>
            ))}
          </div>
        )}
      </div>

      <div className="item-row-actions">
        <button
          type="button"
          className={`fav-btn ${isFavorite ? 'fav-btn--on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
        >
          {isFavorite ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
        </button>
        <button type="button" className="add-btn" onClick={e => { e.stopPropagation(); onOpen(item); }}>
          הוספה
        </button>
      </div>
    </article>
  );
}

export default function MenuSection({ menu, favorites, onToggleFavorite, onOpenItem }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeDiet, setActiveDiet] = useState(() => new Set());
  const [favOnly, setFavOnly] = useState(false);

  function toggleDiet(id) {
    setActiveDiet(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter(item => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (favOnly && !favorites.has(item.id)) return false;
      for (const tag of activeDiet) {
        if (!item.tags.includes(tag)) return false;
      }
      if (q && !item.name.toLowerCase().includes(q) && !item.desc.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [menu, query, activeCategory, activeDiet, favOnly, favorites]);

  const isSearching = query.trim().length > 0 || activeDiet.size > 0 || favOnly;

  const grouped = useMemo(() => {
    if (isSearching || activeCategory !== 'all') {
      return [{ id: activeCategory === 'all' ? 'results' : activeCategory, label: null, items: filtered }];
    }
    return CATEGORIES.map(cat => ({
      id: cat.id,
      label: cat.label,
      items: filtered.filter(i => i.category === cat.id),
    }));
  }, [filtered, isSearching, activeCategory]);

  return (
    <section className="menu-section" id="menu">
      <div className="menu-head">
        <p className="section-eyebrow">התפריט שלנו</p>
        <h2 className="section-title">מה בא לכם היום?</h2>
      </div>

      <div className="menu-controls">
        <label className="search-box">
          <IconSearch size={17} />
          <input
            type="search"
            placeholder="חיפוש לפי מנה או מרכיב… כמו אבוקדו"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="חיפוש בתפריט"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="נקה חיפוש">
              <IconClose size={14} />
            </button>
          )}
        </label>

        <div className="category-scroll" role="tablist" aria-label="קטגוריות תפריט">
          <button
            className={`cat-chip ${activeCategory === 'all' ? 'cat-chip--on' : ''}`}
            onClick={() => setActiveCategory('all')}
            role="tab" aria-selected={activeCategory === 'all'}
          >
            הכול
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`cat-chip ${activeCategory === cat.id ? 'cat-chip--on' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              role="tab" aria-selected={activeCategory === cat.id}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="diet-filters">
          {DIET_FILTERS.map(f => (
            <button
              key={f.id}
              className={`diet-chip ${activeDiet.has(f.id) ? 'diet-chip--on' : ''}`}
              onClick={() => toggleDiet(f.id)}
              aria-pressed={activeDiet.has(f.id)}
            >
              {f.label}
            </button>
          ))}
          <button
            className={`diet-chip ${favOnly ? 'diet-chip--on' : ''}`}
            onClick={() => setFavOnly(v => !v)}
            aria-pressed={favOnly}
          >
            אהובים שלי
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="menu-empty">
          <p>לא מצאנו מנה שמתאימה לחיפוש. נסו מילה אחרת או נקו את הסינון.</p>
        </div>
      ) : (
        grouped.map(group => group.items.length > 0 && (
          <div className="menu-group" key={group.id}>
            {group.label && <h3 className="menu-group-title">{group.label}</h3>}
            <div className="item-list">
              {group.items.map((item, i) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isFavorite={favorites.has(item.id)}
                  onToggleFavorite={onToggleFavorite}
                  onOpen={onOpenItem}
                  delay={Math.min(i, 8) * 50}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
