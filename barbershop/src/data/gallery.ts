import type { GalleryCategory, GalleryItem } from "@/lib/types";

export const galleryCategories: { id: GalleryCategory | "all"; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "fade", label: "פייד" },
  { id: "beard", label: "זקן" },
  { id: "design", label: "עיצוב" },
  { id: "kids", label: "ילדים" },
];

export const gallery: GalleryItem[] = [
  {
    id: "g1",
    title: "Skin Fade קלאסי",
    category: "fade",
    before:
      "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "g2",
    title: "עיצוב זקן מלא",
    category: "beard",
    before:
      "https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "g3",
    title: "קו עיצוב אומנותי",
    category: "design",
    before:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "g4",
    title: "פומפדור מודרני",
    category: "fade",
    before:
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfb02?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "g5",
    title: "תספורת ילדים",
    category: "kids",
    before:
      "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "g6",
    title: "טקסטורה וקרופ",
    category: "design",
    before:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    after:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  },
];
