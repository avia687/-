import type { LucideIcon } from "lucide-react";

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMin: number;
  icon: LucideIcon;
  popular?: boolean;
}

export interface Barber {
  id: string;
  name: string;
  role: string;
  bio: string;
  image: string;
  specialties: string[];
  rating: number;
  reviews: number;
  experienceYears: number;
  instagram?: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  category: GalleryCategory;
  before: string;
  after: string;
}

export type GalleryCategory = "fade" | "beard" | "kids" | "design";

export interface Review {
  id: string;
  name: string;
  text: string;
  rating: number;
  service: string;
  avatarColor: string;
}

export interface BookingDraft {
  serviceId: string | null;
  barberId: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export interface Booking {
  id: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface BookingResponse {
  ok: boolean;
  booking?: Booking;
  error?: string;
  emailSent?: boolean;
}
