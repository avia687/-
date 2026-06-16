"use client";

import { motion } from "framer-motion";
import { Instagram, Calendar, Award } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { RevealGroup, revealItem } from "@/components/effects/Reveal";
import { SmartImage } from "@/components/shared/SmartImage";
import { StarRating } from "@/components/shared/StarRating";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "@/components/sections/booking/BookingContext";
import { bookableBarbers } from "@/data/team";

export function Team() {
  const { chooseBarber } = useBooking();

  return (
    <section
      id="team"
      className="relative overflow-hidden border-y border-white/5 bg-[#08080a] py-24 md:py-32"
    >
      <div className="container-edge">
        <SectionHeading
          eyebrow="הצוות"
          title={
            <>
              המאסטרים <span className="text-gold-gradient">שלנו</span>
            </>
          }
          description="צוות ספרים מהמובילים בארץ, כל אחד עם החתימה והמומחיות הייחודית שלו."
        />

        <RevealGroup
          stagger={0.1}
          className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {bookableBarbers.map((barber) => (
            <motion.article
              key={barber.id}
              variants={revealItem}
              className="card-lux group flex flex-col overflow-hidden"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
                  <SmartImage
                    src={barber.image}
                    alt={barber.name}
                    fallbackLabel={barber.name.charAt(0)}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />

                {barber.instagram ? (
                  <a
                    href={barber.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${barber.name} באינסטגרם`}
                    className="absolute left-3 top-3 grid size-9 translate-y-2 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-all duration-500 hover:text-primary group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    <Instagram className="size-4" />
                  </a>
                ) : null}

                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur">
                  <Award className="size-3.5 text-primary" />
                  {barber.experienceYears} שנ׳
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5 text-right">
                <div>
                  <h3 className="font-display text-lg font-semibold">
                    {barber.name}
                  </h3>
                  <p className="text-sm text-primary">{barber.role}</p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    ({barber.reviews})
                  </span>
                  <StarRating value={barber.rating} size={14} />
                  <span className="text-sm font-semibold">{barber.rating}</span>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {barber.bio}
                </p>

                <div className="flex flex-wrap justify-end gap-1.5">
                  {barber.specialties.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => chooseBarber(barber.id)}
                  className="mt-auto flex items-center justify-center gap-2 rounded-full border border-primary/40 py-2.5 text-sm font-medium text-primary transition-all duration-300 hover:bg-primary/10"
                >
                  <Calendar className="size-4" />
                  קבע תור עם {barber.name.split(" ")[0]}
                </button>
              </div>
            </motion.article>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
