import { z } from "zod";

const israeliPhone = /^0(5\d|[2-489])-?\d{7}$/;

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "יש לבחור שירות"),
  barberId: z.string().min(1, "יש לבחור ספר"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "שעה לא תקינה"),
  name: z.string().trim().min(2, "יש להזין שם מלא").max(60),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => israeliPhone.test(v), "מספר טלפון לא תקין"),
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
  notes: z.string().trim().max(400).optional().default(""),
});

export type BookingInput = z.infer<typeof bookingSchema>;
