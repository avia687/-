const menuItems = [
  {
    id: 'omelette',
    name: 'חביתה',
    emoji: '🍳',
    basePrice: 28,
    description: 'חביתה טרייה'
  },
  {
    id: 'toast',
    name: 'טוסט',
    emoji: '🥪',
    basePrice: 26,
    description: 'רוטב פיצה + גבינה צהובה',
    priceNote: 'תוספת ראשונה כלולה, כל תוספת נוספת 2₪',
    toppings: [
      { id: 'tomato',    name: 'עגבניה',  isFree: false },
      { id: 'onion',     name: 'בצל',     isFree: false },
      { id: 'olives',    name: 'זיתים',   isFree: false },
      { id: 'mushrooms', name: 'פטריות',  isFree: false },
      { id: 'pesto',     name: 'פסטו',    isFree: false },
      { id: 'spicy',     name: 'חריף',    isFree: true  }
    ]
  },
  {
    id: 'veggie-omelette',
    name: 'חביתת ירק',
    emoji: '🥬',
    basePrice: 33,
    description: 'חביתה עם כל הירקות',
    priceNote: 'כל הירקות כלולים במחיר',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' }
    ]
  },
  {
    id: 'mushroom-omelette',
    name: 'חביתת פטריות',
    emoji: '🍄',
    basePrice: 31,
    description: 'חביתה עם פטריות'
  },
  {
    id: 'avocado',
    name: 'סנדביץ אבוקדו',
    emoji: '🥑',
    basePrice: 33,
    description: 'אבוקדו טרי',
    priceNote: 'כל הירקות כלולים במחיר',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' }
    ]
  },
  {
    id: 'cream-cheese',
    name: 'סנדביץ גבינת שמנת',
    emoji: '🥖',
    basePrice: 25,
    description: 'גבינת שמנת טרייה',
    priceNote: 'כל הירקות כלולים במחיר',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' }
    ]
  }
];

module.exports = { menuItems };
