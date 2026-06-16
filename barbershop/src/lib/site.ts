/** Central site configuration — edit these to brand the shop. */
export const site = {
  name: "אדמונד",
  nameEn: "EDMOND",
  tagline: "ברברשופ יוקרתי",
  slogan: "אומנות התספורת הגברית",
  description:
    "ברברשופ יוקרתי המשלב מסורת מספרה קלאסית עם עיצוב שיער מודרני. תספורות גברים, עיצוב זקן, פייד ותספורות ילדים — ברמה הגבוהה ביותר.",
  url: "https://edmond-barbershop.example.com",
  phone: "03-555-0199",
  phoneHref: "+97235550199",
  whatsapp: "972500000000",
  email: "hello@edmond-barbershop.co.il",
  address: "רחוב דיזנגוף 120, תל אביב",
  addressShort: "דיזנגוף 120, תל אביב",
  mapQuery: "Dizengoff 120, Tel Aviv",
  instagram: "https://instagram.com",
  facebook: "https://facebook.com",
  tiktok: "https://tiktok.com",
  hours: [
    { day: "ראשון – חמישי", time: "09:00 – 21:00" },
    { day: "שישי", time: "08:00 – 15:00" },
    { day: "שבת", time: "סגור" },
  ],
  /** Booking working hours per weekday index (0 = Sunday). */
  workingHours: {
    // [openHour, closeHour] in 24h. null = closed.
    0: [9, 21],
    1: [9, 21],
    2: [9, 21],
    3: [9, 21],
    4: [9, 21],
    5: [8, 15],
    6: null,
  } as Record<number, [number, number] | null>,
  slotStepMin: 30,
  stats: [
    { value: "12+", label: "שנות ניסיון" },
    { value: "18K+", label: "לקוחות מרוצים" },
    { value: "4.9", label: "דירוג ממוצע" },
    { value: "5", label: "ספרים מומחים" },
  ],
} as const;

export type Site = typeof site;
