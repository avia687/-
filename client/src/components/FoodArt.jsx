// איורי מנות מצוירים ביד בקוד — לא תמונות, אלא איורים חמים בסגנון אחיד
// שמתאימים לפלטת המזנון. כל איור מזוהה על-ידי מפתח (art id).

const BREAD = '#E8B978';
const BREAD_D = '#C89452';
const CRUST = '#A9702E';
const OLIVE = '#5B6B34';
const OLIVE_D = '#465326';
const TOMATO = '#C1442D';
const TOMATO_D = '#9C3320';
const CREAM = '#FBF2E3';
const YOLK = '#E8A93B';
const CHEESE = '#F0C550';
const CHEESE_D = '#D9A93A';
const GREEN = '#7B9A4C';
const GREEN_D = '#5F7A38';
const BROWN = '#6B4226';

function Bun({ children }) {
  return (
    <>
      <ellipse cx="60" cy="80" rx="38" ry="13" fill={BREAD_D} />
      <path d="M22 80 Q22 52 60 48 Q98 52 98 80 Z" fill={BREAD} stroke={CRUST} strokeWidth="2" />
      {children}
      <ellipse cx="60" cy="86" rx="40" ry="10" fill={BREAD} stroke={CRUST} strokeWidth="2" />
    </>
  );
}

const ARTS = {
  omelette: (
    <Bun>
      <path d="M30 74 Q60 58 90 74 L88 80 Q60 66 32 80 Z" fill={YOLK} opacity="0.95" />
      <ellipse cx="52" cy="70" rx="5" ry="3.5" fill="#fff" opacity="0.85" />
      <ellipse cx="70" cy="73" rx="4" ry="3" fill="#fff" opacity="0.8" />
    </Bun>
  ),
  avocado: (
    <Bun>
      <path d="M28 76 Q60 60 92 76 L90 81 Q60 68 30 81 Z" fill={GREEN} />
      <circle cx="46" cy="75" r="4.5" fill={CREAM} opacity="0.9" />
      <circle cx="46" cy="75" r="2.2" fill={BROWN} />
      <path d="M60 74 Q66 70 74 74" stroke={TOMATO} strokeWidth="3" fill="none" strokeLinecap="round" />
    </Bun>
  ),
  tuna: (
    <Bun>
      <path d="M30 75 Q60 63 90 75 L88 81 Q60 70 32 81 Z" fill="#DCC79A" />
      <circle cx="45" cy="74" r="3" fill={TOMATO} />
      <circle cx="58" cy="72" r="3" fill={TOMATO} />
      <circle cx="72" cy="75" r="3" fill={TOMATO} />
      <path d="M35 78 Q60 72 85 78" stroke={GREEN_D} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Bun>
  ),
  schnitzel: (
    <Bun>
      <path d="M32 74 Q60 62 88 74 Q86 82 60 84 Q34 82 32 74 Z" fill="#E7C878" stroke={CHEESE_D} strokeWidth="1.5" />
      <circle cx="48" cy="72" r="1.6" fill={CHEESE_D} />
      <circle cx="58" cy="76" r="1.6" fill={CHEESE_D} />
      <circle cx="68" cy="71" r="1.6" fill={CHEESE_D} />
      <circle cx="54" cy="80" r="1.6" fill={CHEESE_D} />
      <path d="M34 80 Q60 76 86 80" stroke={GREEN_D} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Bun>
  ),
  cheese: (
    <Bun>
      <path d="M30 76 Q60 63 90 76 L88 82 Q60 70 32 82 Z" fill={CREAM} stroke="#E4D3AE" strokeWidth="1.5" />
      <circle cx="48" cy="75" r="2" fill="#E4D3AE" />
      <circle cx="65" cy="73" r="1.6" fill="#E4D3AE" />
      <circle cx="75" cy="77" r="1.8" fill="#E4D3AE" />
    </Bun>
  ),
  shakshuka: (
    <Bun>
      <path d="M28 76 Q60 66 92 76 L90 82 Q60 74 30 82 Z" fill={TOMATO} />
      <circle cx="50" cy="75" r="5" fill={YOLK} stroke="#fff" strokeWidth="1" />
      <circle cx="68" cy="77" r="4.5" fill={YOLK} stroke="#fff" strokeWidth="1" />
    </Bun>
  ),
  toast: (
    <>
      <rect x="24" y="42" width="72" height="52" rx="10" fill={BREAD} stroke={CRUST} strokeWidth="2.5" />
      <rect x="32" y="50" width="56" height="36" rx="6" fill={CHEESE} opacity="0.9" />
      <path d="M32 62 Q60 56 88 62" stroke={TOMATO} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="46" cy="74" r="3" fill={OLIVE_D} />
      <circle cx="70" cy="76" r="3" fill={OLIVE_D} />
      <circle cx="58" cy="70" r="3" fill={OLIVE_D} />
    </>
  ),
  'toast-egg': (
    <>
      <rect x="24" y="42" width="72" height="52" rx="10" fill={BREAD} stroke={CRUST} strokeWidth="2.5" />
      <rect x="32" y="50" width="56" height="36" rx="6" fill={CHEESE} opacity="0.85" />
      <circle cx="60" cy="68" r="14" fill="#fff" opacity="0.92" />
      <circle cx="60" cy="68" r="6" fill={YOLK} />
    </>
  ),
  cheesemix: (
    <>
      <path d="M35 45 L85 45 L78 88 L42 88 Z" fill={CHEESE} stroke={CHEESE_D} strokeWidth="2" />
      <circle cx="55" cy="60" r="3" fill={CHEESE_D} />
      <circle cx="68" cy="70" r="2.5" fill={CHEESE_D} />
      <path d="M30 50 L58 48 L52 85 L26 82 Z" fill={CREAM} stroke="#E4D3AE" strokeWidth="2" opacity="0.95" />
      <circle cx="42" cy="65" r="2.2" fill="#E4D3AE" />
      <path d="M70 42 L94 46 L86 84 L64 82 Z" fill="#F3E2B0" stroke={CHEESE_D} strokeWidth="2" opacity="0.95" />
    </>
  ),
  feta: (
    <>
      <rect x="28" y="48" width="64" height="38" rx="4" fill={CREAM} stroke="#E4D3AE" strokeWidth="2" />
      <rect x="28" y="48" width="64" height="38" rx="4" fill="url(#fetaShade)" opacity="0.5" />
      <line x1="45" y1="50" x2="45" y2="84" stroke="#E4D3AE" strokeWidth="1.5" />
      <line x1="63" y1="50" x2="63" y2="84" stroke="#E4D3AE" strokeWidth="1.5" />
      <line x1="80" y1="50" x2="80" y2="84" stroke="#E4D3AE" strokeWidth="1.5" />
    </>
  ),
  salad: (
    <>
      <path d="M22 78 Q60 92 98 78 Q92 60 60 58 Q28 60 22 78 Z" fill={GREEN} opacity="0.35" />
      <circle cx="42" cy="68" r="8" fill={TOMATO} />
      <circle cx="42" cy="68" r="8" fill="url(#tomatoShine)" />
      <circle cx="66" cy="62" r="7" fill={TOMATO_D} />
      <circle cx="80" cy="72" r="6" fill="#DFF0C8" stroke={GREEN_D} strokeWidth="2" />
      <circle cx="55" cy="80" r="6" fill="#DFF0C8" stroke={GREEN_D} strokeWidth="2" />
      <path d="M30 74 Q36 66 44 74" stroke={GREEN_D} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  creamcheese: (
    <>
      <ellipse cx="60" cy="70" rx="34" ry="20" fill={CREAM} stroke="#E4D3AE" strokeWidth="2" />
      <path d="M32 64 Q60 54 88 64 Q60 66 32 64Z" fill="#fff" opacity="0.6" />
      <path d="M40 78 Q60 84 80 78" stroke="#E4D3AE" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  egg: (
    <>
      <ellipse cx="45" cy="72" rx="16" ry="12" fill="#fff" stroke="#EADFC8" strokeWidth="2" />
      <ellipse cx="42" cy="69" r="6" fill={YOLK} />
      <ellipse cx="78" cy="76" rx="16" ry="12" fill="#fff" stroke="#EADFC8" strokeWidth="2" />
      <ellipse cx="75" cy="73" r="6" fill={YOLK} />
    </>
  ),
  mushroom: (
    <Bun>
      <path d="M30 75 Q60 62 90 75 L88 81 Q60 71 32 81 Z" fill={YOLK} opacity="0.9" />
      <ellipse cx="45" cy="72" rx="7" ry="5" fill={BROWN} />
      <ellipse cx="45" cy="70" rx="3.5" ry="1.6" fill="#DDBFA0" opacity="0.8" />
      <ellipse cx="62" cy="76" rx="8" ry="5.5" fill="#8B5E3C" />
      <ellipse cx="62" cy="74" rx="4" ry="1.8" fill="#DDBFA0" opacity="0.8" />
      <ellipse cx="78" cy="71" rx="6" ry="4.5" fill={BROWN} />
    </Bun>
  ),
  veggie: (
    <Bun>
      <path d="M26 77 Q60 90 94 77 Q88 68 60 66 Q32 68 26 77 Z" fill={GREEN} opacity="0.4" />
      <circle cx="44" cy="72" r="5.5" fill={TOMATO} />
      <circle cx="60" cy="76" r="5" fill={TOMATO_D} />
      <ellipse cx="76" cy="71" rx="6" ry="3" fill="#E9D3F0" stroke="#B98FCB" strokeWidth="1" />
      <path d="M34 74 Q40 68 48 74" stroke={GREEN_D} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </Bun>
  ),
  spanish: (
    <Bun>
      <path d="M30 76 Q60 64 90 76 L88 81 Q60 72 32 81 Z" fill="#F0C550" opacity="0.9" />
      <rect x="38" y="70" width="14" height="5" rx="2.5" fill={TOMATO} transform="rotate(-8 45 72)" />
      <rect x="58" y="68" width="16" height="5" rx="2.5" fill="#D9762A" transform="rotate(6 66 70)" />
      <circle cx="50" cy="78" r="2.4" fill={OLIVE_D} />
      <circle cx="70" cy="78" r="2.4" fill={OLIVE_D} />
    </Bun>
  ),
  tunisian: (
    <Bun>
      <path d="M28 76 Q60 68 92 76 L90 82 Q60 76 30 82 Z" fill="#B23A22" />
      <path d="M30 78 Q60 70 90 78" stroke="#8C2A18" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M48 72 L58 72 L53 80 Z" fill={YOLK} stroke="#fff" strokeWidth="1" />
      <circle cx="72" cy="74" r="2.6" fill={OLIVE_D} />
      <circle cx="40" cy="75" r="2.6" fill={OLIVE_D} />
    </Bun>
  ),
};

function Bottle({ color, dark }) {
  return (
    <>
      <rect x="47" y="30" width="14" height="14" rx="3" fill={dark} />
      <path
        d="M46 44 Q46 40 51 38 L57 38 Q62 40 62 44 L64 92 Q64 100 54 100 Q44 100 44 92 Z"
        fill={color}
        stroke={dark}
        strokeWidth="2"
      />
      <rect x="44" y="58" width="20" height="26" fill="#fff" opacity="0.12" />
      <path d="M50 46 L50 90" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <rect x="42" y="52" width="24" height="10" rx="2" fill="#fff" opacity="0.85" />
    </>
  );
}

const DRINK_COLORS = {
  cola: ['#B32020', '#7A1414'],
  'cola-zero': ['#2B2B2B', '#111111'],
  fanta: ['#E8792E', '#B85A1C'],
  sprite: ['#4FA24A', '#33702F'],
  'water-grape': ['#7C4FA6', '#583170'],
  'water-peach': ['#E0965A', '#B56E38'],
  excel: ['#3D7FBF', '#285A8C'],
  'excel-black': ['#333333', '#161616'],
  'excel-blue': ['#2E9CC4', '#1F6E8C'],
};

export default function FoodArt({ id, size = 96 }) {
  const drinkColors = DRINK_COLORS[id];
  const shape = drinkColors
    ? <Bottle color={drinkColors[0]} dark={drinkColors[1]} />
    : (ARTS[id] || ARTS.omelette);
  return (
    <svg
      className="food-art"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="plateGlow" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#FFF7E8" />
          <stop offset="100%" stopColor="#F4E3C4" />
        </radialGradient>
        <linearGradient id="fetaShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="tomatoShine" cx="35%" cy="30%" r="40%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#plateGlow)" />
      <circle cx="60" cy="60" r="56" fill="none" stroke="#E9D5AC" strokeWidth="1.5" opacity="0.8" />
      {shape}
    </svg>
  );
}
