"use client";

import { Phone, MessageCircle, MapPin, Clock, Navigation } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Reveal } from "@/components/effects/Reveal";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";

const waText = encodeURIComponent("היי! אשמח לקבוע תור 💈");

export function Contact() {
  return (
    <section
      id="contact"
      className="relative overflow-hidden border-t border-white/5 bg-[#08080a] py-24 md:py-32"
    >
      <div className="container-edge">
        <SectionHeading
          eyebrow="צרו קשר"
          title={
            <>
              בואו <span className="text-gold-gradient">להתארח</span>
            </>
          }
          description="אנחנו כאן בשבילך. התקשרו, שלחו הודעה או פשוט קפצו לביקור."
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {/* Info */}
          <Reveal direction="right" className="flex flex-col gap-4">
            <ContactCard
              icon={Phone}
              title="טלפון"
              value={site.phone}
              href={`tel:${site.phoneHref}`}
              action="חייג"
            />
            <ContactCard
              icon={MessageCircle}
              title="WhatsApp"
              value="מענה מהיר תוך דקות"
              href={`https://wa.me/${site.whatsapp}?text=${waText}`}
              action="שלח הודעה"
              external
            />
            <ContactCard
              icon={MapPin}
              title="כתובת"
              value={site.address}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery)}`}
              action="נווט"
              external
            />

            <div className="card-lux flex flex-col gap-3 p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Clock className="size-5" />
                </span>
                <h3 className="font-display text-lg font-semibold">שעות פעילות</h3>
              </div>
              <ul className="space-y-2">
                {site.hours.map((h) => (
                  <li
                    key={h.day}
                    className="flex items-center justify-between border-b border-white/5 pb-2 text-sm last:border-0"
                  >
                    <span className="text-muted-foreground">{h.day}</span>
                    <span className="font-medium">{h.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Map */}
          <Reveal direction="left" className="min-h-[420px]">
            <div className="card-lux relative h-full min-h-[420px] overflow-hidden">
              <iframe
                title={`מפה — ${site.address}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&z=15&output=embed`}
                className="absolute inset-0 h-full w-full grayscale-[0.3] invert-[0.92] hue-rotate-180 contrast-[0.9]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-primary/10" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-4 left-4"
              >
                <Button size="sm">
                  <Navigation className="size-4" />
                  פתח ב-Google Maps
                </Button>
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactCard({
  icon: Icon,
  title,
  value,
  href,
  action,
  external,
}: {
  icon: typeof Phone;
  title: string;
  value: string;
  href: string;
  action: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="card-lux group flex items-center gap-4 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-gold"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        <Icon className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="font-medium">{value}</p>
      </div>
      <span className="text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {action} ←
      </span>
    </a>
  );
}
