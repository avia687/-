import { useState } from 'react';
import { SITE_INFO } from '../data/menu';
import { IconChevronDown } from './Icons';

const FAQS = [
  {
    q: 'מה שעות הפעילות שלכם?',
    a: `אנחנו פתוחים בימים א׳–ה׳ בין 09:00–21:00, בימי שישי בין 09:00–15:00, ובשבת סגורים. שעת ההכנה המשוערת להזמנה היא כ-${SITE_INFO.prepTimeMinutes} דקות.`,
  },
  {
    q: 'עד איפה אתם מגיעים במשלוחים?',
    a: `${SITE_INFO.deliveryRadius}. אם אתם לא בטוחים אם אנחנו מגיעים אליכם, פשוט תתקשרו או תכתבו לנו בוואטסאפ ונבדוק בשמחה.`,
  },
  {
    q: 'איך משלמים על ההזמנה?',
    a: 'ניתן לשלם במזומן, בביט או בפייבוקס ישירות מול המזנון בעת האיסוף או המשלוח. האתר פועל במצב הדגמה ואינו כולל סליקת אשראי מקוונת.',
  },
  {
    q: 'יש לי רגישות או אלרגיה — מה עושים?',
    a: 'ספרו לנו בהערות להזמנה, ואנחנו נתאים בשמחה. חשוב לדעת שהמטבח שלנו עובד עם גלוטן, ביצים ומוצרי חלב.',
  },
  {
    q: 'אפשר לבטל או לשנות הזמנה אחרי השליחה?',
    a: 'כן, פשוט תתקשרו אלינו או תכתבו בוואטסאפ בהקדם האפשרי — נשמח לעזור כל עוד ההזמנה עוד לא נכנסה להכנה.',
  },
];

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <section className="faq-section" id="faq">
      <p className="section-eyebrow">עוד לפני שמזמינים</p>
      <h2 className="section-title">שאלות נפוצות</h2>

      <div className="faq-list">
        {FAQS.map((item, i) => (
          <div className={`faq-item ${openIdx === i ? 'faq-item--open' : ''}`} key={i}>
            <button
              className="faq-q"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              aria-expanded={openIdx === i}
            >
              <span>{item.q}</span>
              <span className="faq-arrow"><IconChevronDown size={16} /></span>
            </button>
            <div className="faq-a-wrap">
              <p className="faq-a">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
