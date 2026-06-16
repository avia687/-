import { Scissors, BringToFront, Sparkles, Baby, Brush, Droplets } from "lucide-react";
import type { Service } from "@/lib/types";

export const services: Service[] = [
  {
    id: "mens-haircut",
    name: "תספורת גברים",
    description:
      "תספורת מדויקת המותאמת למבנה הפנים ולסגנון האישי, כולל שטיפה ועיצוב.",
    price: 80,
    durationMin: 30,
    icon: Scissors,
    popular: true,
  },
  {
    id: "beard",
    name: "עיצוב זקן",
    description:
      "עיצוב וגיזום זקן עם תער חם, שמנים מטפחים ופינישינג מושלם לקו לסת חד.",
    price: 50,
    durationMin: 30,
    icon: BringToFront,
  },
  {
    id: "fade",
    name: "פייד (Skin Fade)",
    description:
      "מעבר גוונים חלק ומדויק מהעור ועד למעלה — חתימת הברברשופ המודרני.",
    price: 90,
    durationMin: 45,
    icon: Sparkles,
    popular: true,
  },
  {
    id: "kids",
    name: "תספורת ילדים",
    description:
      "חוויה נעימה וסבלנית לילדים, בסביבה ידידותית ועם תוצאה שתמיד מרשימה.",
    price: 60,
    durationMin: 30,
    icon: Baby,
  },
  {
    id: "hair-design",
    name: "עיצוב שיער",
    description:
      "קווי עיצוב, פריחות ודוגמאות אומנותיות בהתאמה אישית מלאה לסגנון שלך.",
    price: 110,
    durationMin: 45,
    icon: Brush,
  },
  {
    id: "full-package",
    name: "חבילת VIP מלאה",
    description:
      "תספורת + עיצוב זקן + טיפוח פנים מלא ומשקה. החוויה היוקרתית במלואה.",
    price: 180,
    durationMin: 75,
    icon: Droplets,
  },
];

export function getService(id: string | null): Service | undefined {
  return services.find((s) => s.id === id);
}
