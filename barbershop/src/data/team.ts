import type { Barber } from "@/lib/types";

export const team: Barber[] = [
  {
    id: "any",
    name: "ללא העדפה",
    role: "השיבוץ הראשון שמתפנה",
    bio: "נשבץ עבורך את הספר המנוסה הראשון שמתפנה במועד שבחרת.",
    image: "",
    specialties: ["זמינות מהירה"],
    rating: 4.9,
    reviews: 0,
    experienceYears: 0,
  },
  {
    id: "edmond",
    name: "אדמונד לוי",
    role: "מאסטר ברבר ומייסד",
    bio: "מייסד הברברשופ, בעל חזון של דיוק ויוקרה. מתמחה בפייד קלאסי ובעיצוב זקן.",
    image:
      "https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?auto=format&fit=crop&w=800&q=80",
    specialties: ["Skin Fade", "עיצוב זקן", "קלאסי"],
    rating: 5.0,
    reviews: 612,
    experienceYears: 16,
    instagram: "https://instagram.com",
  },
  {
    id: "daniel",
    name: "דניאל כהן",
    role: "סניור ברבר",
    bio: "אומן הפייד המודרני. כל תספורת אצלו היא יצירת אומנות מדויקת עד המילימטר.",
    image:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80",
    specialties: ["Skin Fade", "עיצוב שיער", "טרנדים"],
    rating: 4.9,
    reviews: 438,
    experienceYears: 9,
    instagram: "https://instagram.com",
  },
  {
    id: "yossi",
    name: "יוסי אברהם",
    role: "ברבר וטיפוח זקן",
    bio: "מומחה לזקנים וגילוח תער חם. ידיים יציבות, סבלנות אינסופית ותשומת לב לפרטים.",
    image:
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfb02?auto=format&fit=crop&w=800&q=80",
    specialties: ["גילוח תער", "עיצוב זקן", "טיפוח פנים"],
    rating: 4.9,
    reviews: 357,
    experienceYears: 11,
    instagram: "https://instagram.com",
  },
  {
    id: "noam",
    name: "נועם שגב",
    role: "ברבר וצוות ילדים",
    bio: "האהוב על הקטנטנים. הופך כל תספורת ילדים לחוויה כיפית, רגועה ומוצלחת.",
    image:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=80",
    specialties: ["ילדים", "תספורות קלאסי", "סטיילינג"],
    rating: 4.8,
    reviews: 281,
    experienceYears: 6,
    instagram: "https://instagram.com",
  },
];

/** Bookable barbers (exclude the "no preference" placeholder when needed). */
export const bookableBarbers = team.filter((b) => b.id !== "any");

export function getBarber(id: string | null): Barber | undefined {
  return team.find((b) => b.id === id);
}
