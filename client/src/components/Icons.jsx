// סט אייקונים מינימלי בקו אחיד — ללא אימוג'ים וללא איורים.
// כל אייקון הוא SVG קווי פשוט שיורש צבע מההורה (currentColor).

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconSearch = p => (
  <Svg {...p}><circle cx="11" cy="11" r="7" {...base} /><path d="M21 21l-4.3-4.3" {...base} /></Svg>
);

export const IconBag = p => (
  <Svg {...p}>
    <path d="M6 8h12l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20.5L6 8Z" {...base} />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" {...base} />
  </Svg>
);

export const IconHeart = p => (
  <Svg {...p}><path d="M12 20.2c-.3 0-.6-.1-.8-.3-2.4-2-8-6.7-8-11a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3c0 4.3-5.6 9-8 11-.2.2-.5.3-.8.3Z" {...base} /></Svg>
);

export const IconHeartFilled = p => (
  <Svg {...p}><path d="M12 20.2c-.3 0-.6-.1-.8-.3-2.4-2-8-6.7-8-11a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3c0 4.3-5.6 9-8 11-.2.2-.5.3-.8.3Z" fill="currentColor" stroke="none" /></Svg>
);

export const IconClose = p => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" {...base} /></Svg>
);

export const IconChevronDown = p => (
  <Svg {...p}><path d="M6 9l6 6 6-6" {...base} /></Svg>
);

export const IconTrash = p => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .7 12a2 2 0 0 0 2 1.9h4.6a2 2 0 0 0 2-1.9L18 7" {...base} />
  </Svg>
);

export const IconCheck = p => (
  <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7" {...base} /></Svg>
);

export const IconPhone = p => (
  <Svg {...p}><path d="M6.5 3.5h3l1.5 4-2 1.7a12 12 0 0 0 5.8 5.8l1.7-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A17 17 0 0 1 5 8.6 1.5 1.5 0 0 1 6.5 3.5Z" {...base} /></Svg>
);

export const IconPin = p => (
  <Svg {...p}>
    <path d="M12 21s7-6.5 7-11.5a7 7 0 0 0-14 0C5 14.5 12 21 12 21Z" {...base} />
    <circle cx="12" cy="9.5" r="2.3" {...base} />
  </Svg>
);

export const IconClock = p => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...base} /><path d="M12 7.5V12l3 2" {...base} /></Svg>
);

export const IconTruck = p => (
  <Svg {...p}>
    <path d="M3 7h10v9H3z" {...base} />
    <path d="M13 10.5h4l3 3V16h-7z" {...base} />
    <circle cx="7" cy="18" r="1.6" {...base} />
    <circle cx="17" cy="18" r="1.6" {...base} />
  </Svg>
);

export const IconBox = p => (
  <Svg {...p}>
    <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" {...base} />
    <path d="M3.5 8v8L12 20l8.5-4V8" {...base} />
    <path d="M12 12v8" {...base} />
  </Svg>
);

export const IconLock = p => (
  <Svg {...p}>
    <rect x="5.5" y="10.5" width="13" height="9" rx="1.6" {...base} />
    <path d="M8 10.5V7.7a4 4 0 0 1 8 0v2.8" {...base} />
  </Svg>
);

export const IconChat = p => (
  <Svg {...p}>
    <path d="M4 12.2C4 7.7 7.8 4 12.4 4S20.8 7.7 20.8 12.2c0 4.5-3.8 8.2-8.4 8.2a9 9 0 0 1-3.4-.7L4 21l1.4-4.2A8 8 0 0 1 4 12.2Z" {...base} />
  </Svg>
);

export const IconArrowRight = p => (
  <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" {...base} /></Svg>
);

export const IconRefresh = p => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 1 0 18.5 16" {...base} />
    <path d="M20 6v5.5h-5.5" {...base} />
  </Svg>
);
