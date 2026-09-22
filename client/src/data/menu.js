// כל הפרטים כאן — שמות, מחירים ותיאורים — קלים לעריכה במקום אחד.

export const SITE_INFO = {
  name: 'המזנון של הקרון',
  tagline: 'טרי, חם ומוכן במיוחד בשבילכם',
  phoneDisplay: '054-541-4123',
  whatsapp: '972545414123',
  address: 'רחוב אבא הלל 12, רמת גן',
  prepTimeMinutes: 20,
  deliveryFee: 15,
  freeDeliveryThreshold: 100,
  deliveryRadius: 'משלוחים עד 5 ק"מ מהמזנון',
  hours: [
    { days: 'ראשון–חמישי', label: 'א׳–ה׳', open: '09:00', close: '21:00' },
    { days: 'שישי',        label: 'ו׳',    open: '09:00', close: '15:00' },
    { days: 'שבת',         label: 'שבת',   open: null,    close: null   },
  ],
};

// art: מזהה איור (ראו FoodArt.jsx)
// tags: popular | vegetarian | vegan | spicy

export const CATEGORIES = [
  { id: 'sandwiches', label: 'כריכים',        icon: '🥪' },
  { id: 'toasts',     label: 'טוסטים',        icon: '🧀' },
  { id: 'extras',     label: 'מנות נוספות',   icon: '🥗' },
];

export const SANDWICH_ADDONS = [
  { id: 'egg',   name: 'ביצה קשה',          price: 3 },
  { id: 'tuna',  name: 'טונה, קופסה שלמה',  price: 7 },
  { id: 'feta',  name: 'גבינה מלוחה',        price: 5 },
];

export const TOAST_ADDONS = [
  { id: 'olives',   name: 'זיתים',        price: 2 },
  { id: 'mushroom', name: 'פטריות',       price: 2 },
  { id: 'cheese',   name: 'גבינה צהובה',  price: 2 },
  { id: 'onion',    name: 'בצל',          price: 2 },
];

export const MENU = [
  // ── כריכים ──
  {
    id: 'sw-omelette', category: 'sandwiches', art: 'omelette',
    name: 'כריך חביתה', price: 30,
    desc: 'חביתה טרייה מטוגנת על המקום, בתוך לחמנייה פריכה וחמה.',
    tags: ['popular', 'vegetarian'],
    addons: 'sandwich',
  },
  {
    id: 'sw-avocado', category: 'sandwiches', art: 'avocado',
    name: 'כריך אבוקדו', price: 33,
    desc: 'אבוקדו בשל נמעך ברוטב לימון קליל, עגבנייה ובצל סגול.',
    tags: ['popular', 'vegan', 'vegetarian'],
    addons: 'sandwich',
  },
  {
    id: 'sw-tuna', category: 'sandwiches', art: 'tuna',
    name: 'כריך טונה', price: 33,
    desc: 'סלט טונה ביתי ברוטב מיונז קליל, עם ירקות טריים.',
    tags: [],
    addons: 'sandwich',
  },
  {
    id: 'sw-schnitzel', category: 'sandwiches', art: 'schnitzel',
    name: 'כריך שניצל', price: 33,
    desc: 'שניצל פריך וזהוב, חסה ועגבנייה, וקצת מיונז שום.',
    tags: ['popular'],
    addons: 'sandwich',
  },
  {
    id: 'sw-bulgarian', category: 'sandwiches', art: 'cheese',
    name: 'כריך גבינה בולגרית', price: 37,
    desc: 'נדיבות של גבינה בולגרית מלוחה, עגבנייה ושמן זית.',
    tags: ['vegetarian'],
    addons: 'sandwich',
  },
  {
    id: 'sw-shakshuka', category: 'sandwiches', art: 'shakshuka',
    name: 'כריך שקשוקה', price: 35,
    desc: 'ביצים ברוטב עגבניות פיקנטי, נספג יפה בתוך הלחמנייה.',
    tags: ['popular', 'vegetarian', 'spicy'],
    addons: 'sandwich',
  },

  // ── טוסטים ──
  {
    id: 'ts-single', category: 'toasts', art: 'toast',
    name: 'טוסט עם תוספת אחת', price: 28,
    desc: 'טוסט חם ופריך עם רוטב פיצה וגבינה צהובה, ותוספת אחת לבחירתכם.',
    tags: ['vegetarian'],
    addons: 'toast',
    includedToppings: 1,
  },
  {
    id: 'ts-omelette', category: 'toasts', art: 'toast-egg',
    name: 'טוסט כריך חביתה', price: 35,
    desc: 'שילוב מנצח של טוסט פריך עם חביתה חמה בפנים.',
    tags: ['vegetarian'],
    addons: 'toast',
    includedToppings: 1,
  },

  // ── מנות נוספות ──
  {
    id: 'ex-cheesemix', category: 'extras', art: 'cheesemix',
    name: 'מיקס גבינות', price: 35,
    desc: 'מבחר גבינות משובחות, מוגש עם לחם טרי בצד.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-feta', category: 'extras', art: 'feta',
    name: 'גבינה מלוחה', price: 34,
    desc: 'גבינה מלוחה איכותית, פרוסה נדיבה ומוגשת טרי.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-avocado', category: 'extras', art: 'avocado',
    name: 'אבוקדו', price: 34,
    desc: 'מנת אבוקדו טרי, במרקם קרמי ובתיבול עדין.',
    tags: ['vegan', 'vegetarian'],
  },
  {
    id: 'ex-tuna', category: 'extras', art: 'tuna',
    name: 'טונה', price: 35,
    desc: 'סלט טונה ביתי, נדיב ועשיר, מוכן טרי כל יום.',
    tags: [],
  },
  {
    id: 'ex-salad', category: 'extras', art: 'salad',
    name: 'סלט צנוניות, עגבנייה ומלפפון', price: 35,
    desc: 'סלט קצוץ דק ורענן, מתובל בשמן זית ולימון.',
    tags: ['vegan', 'vegetarian'],
  },
  {
    id: 'ex-creamcheese', category: 'extras', art: 'creamcheese',
    name: 'גבינת שמנת', price: 28,
    desc: 'גבינת שמנת רכה וטרייה, קלאסית ומפנקת.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-egg', category: 'extras', art: 'egg',
    name: 'ביצה קשה', price: 30,
    desc: 'ביצים קשות טריות, מוגשות פרוסות עם תיבול קל.',
    tags: ['vegetarian'],
  },
];
