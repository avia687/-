// כל הפרטים כאן — שמות, מחירים ותיאורים — קלים לעריכה במקום אחד.

export const SITE_INFO = {
  name: 'הקרון',
  tagline: 'מזנון עם השראה',
  marketingLine: 'טרי, חם ומוכן במיוחד בשבילכם',
  phoneDisplay: '054-541-4123',
  whatsapp: '972545414123',
  address: 'הגבעה הצהובה',
  prepTimeMinutes: 20,
  deliveryFee: 15,
  freeDeliveryThreshold: 100,
  deliveryRadius: 'משלוחים עד 5 ק"מ מהמזנון',
  orderCutoff: '15:00',
  // המקום עצמו פתוח עד 16:00, אך הזמנת סנדוויצ'ים מתקבלת עד orderCutoff
  hours: [
    { days: 'ראשון–שישי', label: 'א׳–ו׳', open: '07:30', close: '16:00' },
    { days: 'שבת',        label: 'שבת',   open: null,    close: null   },
  ],
};

// tags: popular | vegetarian | vegan | spicy

export const CATEGORIES = [
  { id: 'sandwiches', label: 'סנדוויצ׳ים' },
  { id: 'toasts',     label: 'טוסטים' },
  { id: 'extras',     label: 'מנות נוספות' },
  { id: 'drinks',     label: 'שתייה' },
];

// ירקות חינמיות לבחירה על גבי הסנדוויצ'ים
export const SANDWICH_VEGETABLES = [
  { id: 'tomato',   name: 'עגבניה' },
  { id: 'cucumber', name: 'מלפפון' },
  { id: 'lettuce',  name: 'חסה' },
  { id: 'onion',    name: 'בצל' },
  { id: 'olives',   name: 'זיתים' },
  { id: 'pickles',  name: 'חמוצים' },
];

// תוספת ראשונה כלולה בטוסט, כל תוספת נוספת 2₪
export const TOAST_TOPPINGS = [
  { id: 'olives',      name: 'זיתים' },
  { id: 'mushroom',    name: 'פטריות' },
  { id: 'red-onion',   name: 'בצל סגול' },
  { id: 'corn',        name: 'תירס' },
];
export const TOAST_TOPPING_PRICE = 2;

// רטבים חינמיים לבחירה על הטוסט
export const TOAST_SAUCES = [
  { id: 'garlic',     name: 'שום אלף האיים' },
  { id: 'vinaigrette', name: 'וינגרט' },
];

// תוספות בתשלום — זמינות גם על סנדוויץ' וגם על טוסט
export const PAID_ADDONS = [
  { id: 'egg',   name: 'ביצה קשה',          price: 3 },
  { id: 'tuna',  name: 'טונה, קופסה שלמה',  price: 7 },
  { id: 'feta',  name: 'גבינה מלוחה',        price: 5 },
];

export const MENU = [
  // ── סנדוויצ'ים ──
  {
    id: 'sw-league', category: 'sandwiches',
    name: 'חביתת ליגת האלופות', price: 30,
    desc: 'חביתה טרייה מטוגנת על המקום, בתוך לחמנייה פריכה וחמה — אלופה בכל ביס.',
    tags: ['popular', 'vegetarian'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-mushroom', category: 'sandwiches',
    name: 'חביתת פטריות היער הטוב', price: 33,
    desc: 'חביתה עם פטריות מוקפצות בחמאה, ריח של יער ובוקר טוב.',
    tags: ['vegetarian'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-shoshana', category: 'sandwiches',
    name: 'חביתת ירק של שושנה מועלם', price: 33,
    desc: 'חביתת ירקות עשירה כמו שסבתא שושנה הייתה מכינה — נדיבה ומלאת טעם.',
    tags: ['popular', 'vegetarian'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-spanish', category: 'sandwiches',
    name: 'חביתה ספרדית מתנשאת', price: 33,
    desc: 'חביתה עם פלפלים קלויים וזיתים — קצת יומרנית, מאוד טעימה.',
    tags: ['vegetarian'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-jerusalem', category: 'sandwiches',
    name: 'חביתת ירושלים דכולא בה', price: 37,
    desc: 'נדיבות של גבינה בולגרית מלוחה על חביתה חמה — הכול בה, כמו שאומרים.',
    tags: ['popular', 'vegetarian'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-shakshuka', category: 'sandwiches',
    name: 'שקשוקה P.HD', price: 35,
    desc: 'ביצים ברוטב עגבניות פיקנטי ברמת דוקטורט — נספג יפה בתוך הלחמנייה.',
    tags: ['popular', 'vegetarian', 'spicy'],
    vegetables: true, paidAddons: true,
  },
  {
    id: 'sw-tunisian', category: 'sandwiches',
    name: 'סנדוויץ׳ טוניסאי צפון אפריקאי', price: 35,
    desc: 'הריסה חריפה, ביצה וזיתים בסגנון צפון אפריקאי אותנטי — לאוהבי החריף.',
    tags: ['spicy'],
    vegetables: true, paidAddons: true,
  },

  // ── טוסטים ──
  {
    id: 'ts-single', category: 'toasts',
    name: 'טוסט', price: 28,
    desc: 'טוסט חם ופריך עם רוטב פיצה וגבינה צהובה, ותוספת אחת כלולה במחיר.',
    tags: ['vegetarian'],
    includedToppings: 1, toastToppings: true, sauces: true, paidAddons: true,
  },
  {
    id: 'ts-dreamloaf', category: 'toasts',
    name: 'טוסט כיכר החלומות', price: 35,
    desc: 'שילוב מנצח של טוסט פריך עם חביתה חמה בפנים — בדיוק כמו שחלמתם.',
    tags: ['popular', 'vegetarian'],
    includedToppings: 1, toastToppings: true, sauces: true, paidAddons: true,
  },

  // ── מנות נוספות ──
  {
    id: 'ex-cheesemix', category: 'extras',
    name: 'מיקס גבינות', price: 35,
    desc: 'מבחר גבינות משובחות, מוגש עם לחם טרי בצד.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-feta', category: 'extras',
    name: 'גבינה מלוחה', price: 34,
    desc: 'גבינה מלוחה איכותית, פרוסה נדיבה ומוגשת טרי.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-avocado', category: 'extras',
    name: 'אבו-קאדה', price: 34,
    desc: 'מנת אבוקדו טרי, במרקם קרמי ובתיבול עדין.',
    tags: ['vegan', 'vegetarian'],
  },
  {
    id: 'ex-tuna', category: 'extras',
    name: 'טונה מדושנת עונג', price: 35,
    desc: 'סלט טונה ביתי, נדיב ועשיר, מוכן טרי כל יום.',
    tags: [],
  },
  {
    id: 'ex-creamcheese', category: 'extras',
    name: 'גבינת שמנת', price: 28,
    desc: 'גבינת שמנת רכה וטרייה, קלאסית ומפנקת.',
    tags: ['vegetarian'],
  },
  {
    id: 'ex-egg', category: 'extras',
    name: 'ביצה קשה טרייה', price: 30,
    desc: 'ביצים קשות טריות כמו ביום היוולדה — מוגשות פרוסות עם תיבול קל.',
    tags: ['vegetarian'],
  },
];

// שתייה — מוצגת גם כקטגוריה משלה וגם כהצעה בסל ("רוצים גם לשתות?")
// שדה image מצביע ל-client/public/drinks/<file> — ברגע שהתמונה תתווסף לשם
// היא תופיע אוטומטית בכרטיס ובחלון המנה (יש נפילה חינניים אם הקובץ עוד לא קיים).
const CAN_BOTTLE = [{ id: 'can', label: 'פחית', price: 8 }, { id: 'bottle', label: 'בקבוק', price: 10 }];

export const DRINKS = [
  {
    id: 'coke', category: 'drinks',
    name: 'קולה', desc: 'קרה ומרעננת.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/coke.jpg',
  },
  {
    id: 'coke-zero', category: 'drinks',
    name: 'קולה זירו', desc: 'כל הטעם, בלי הסוכר.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/coke-zero.jpg',
  },
  {
    id: 'fanta', category: 'drinks',
    name: 'פאנטה', desc: 'תפוזים תוססים וקרים.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/fanta.jpg',
  },
  {
    id: 'excel', category: 'drinks',
    name: 'אקסל', desc: 'משקה אנרגיה קלאסי.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/excel.jpg',
  },
  {
    id: 'sprite', category: 'drinks',
    name: 'ספרייט', desc: 'לימון-ליים מצנן.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/sprite.jpg',
  },
  {
    id: 'sprite-zero', category: 'drinks',
    name: 'ספרייט זירו', desc: 'כל הרעננות, בלי הסוכר.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/sprite-zero.jpg',
  },
  {
    id: 'fuze-tea', category: 'drinks',
    name: 'פיוז טי', desc: 'תה קר פירותי ורענן.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/fuze-tea.jpg',
  },
  {
    id: 'fuze-tea-zero', category: 'drinks',
    name: 'פיוז טי זירו', desc: 'תה קר פירותי, בלי סוכר.', tags: [],
    sizes: CAN_BOTTLE, image: '/drinks/fuze-tea-zero.jpg',
  },
];

export const ALL_ITEMS = [...MENU, ...DRINKS];
