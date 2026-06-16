"use client";

import { motion } from "framer-motion";
import { Clock, ArrowLeft, Star } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { RevealGroup, revealItem } from "@/components/effects/Reveal";
import { TiltCard } from "@/components/effects/TiltCard";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "@/components/sections/booking/BookingContext";
import { services } from "@/data/services";
import { formatPrice } from "@/lib/utils";

export function Services() {
  const { chooseService } = useBooking();

  return (
    <section
      id="services"
      className="relative overflow-hidden border-y border-white/5 bg-[#08080a] py-24 md:py-32"
    >
      <div className="container-edge">
        <SectionHeading
          eyebrow="השירותים שלנו"
          title={
            <>
              שירותים ברמת <span className="text-gold-gradient">פרימיום</span>
            </>
          }
          description="כל שירות מבוצע בקפידה על ידי מאסטרים מנוסים, עם מוצרי הטיפוח הטובים בעולם."
        />

        <RevealGroup
          stagger={0.1}
          className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {services.map((service) => (
            <motion.div key={service.id} variants={revealItem}>
              <TiltCard max={6} className="h-full">
                <button
                  type="button"
                  onClick={() => chooseService(service.id)}
                  className="card-lux group flex h-full w-full flex-col gap-4 p-7 text-right transition-all duration-500 hover:-translate-y-1.5 hover:shadow-gold"
                >
                  <div className="flex items-start justify-between">
                    <span className="relative grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/5 text-primary transition-colors duration-500 group-hover:bg-primary/15">
                      <service.icon className="size-7" />
                      <span className="absolute inset-0 rounded-2xl opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100 group-hover:shadow-glow" />
                    </span>
                    {service.popular ? (
                      <Badge variant="solid" className="gap-1">
                        <Star className="size-3 fill-current" />
                        פופולרי
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="font-display text-xl font-semibold">
                      {service.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {service.description}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-4">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      {service.durationMin} דק׳
                    </span>
                    <span className="font-display text-2xl font-bold text-gold-gradient">
                      {formatPrice(service.price)}
                    </span>
                  </div>

                  <span className="flex items-center gap-2 text-sm font-medium text-primary opacity-0 transition-all duration-500 group-hover:gap-3 group-hover:opacity-100">
                    הזמן עכשיו <ArrowLeft className="size-4" />
                  </span>
                </button>
              </TiltCard>
            </motion.div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
