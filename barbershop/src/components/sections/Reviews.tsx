"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { RevealGroup, revealItem } from "@/components/effects/Reveal";
import { StarRating } from "@/components/shared/StarRating";
import { Badge } from "@/components/ui/badge";
import { reviews } from "@/data/reviews";

export function Reviews() {
  return (
    <section id="reviews" className="relative py-24 md:py-32">
      <div className="container-edge">
        <SectionHeading
          eyebrow="ביקורות"
          title={
            <>
              מה הלקוחות <span className="text-gold-gradient">אומרים</span>
            </>
          }
          description="אלפי גברים בחרו בנו. הנה חלק קטן מהסיבות שהם חוזרים."
        />

        <RevealGroup
          stagger={0.08}
          className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {reviews.map((review) => (
            <motion.figure
              key={review.id}
              variants={revealItem}
              className="card-lux flex h-full flex-col gap-4 p-7"
            >
              <div className="flex items-center justify-between">
                <Quote className="size-8 text-primary/40" />
                <StarRating value={review.rating} />
              </div>
              <blockquote className="flex-1 text-pretty text-sm leading-relaxed text-foreground/85">
                “{review.text}”
              </blockquote>
              <figcaption className="flex items-center gap-3 border-t border-white/5 pt-4">
                <span
                  className="grid size-11 place-items-center rounded-full font-display text-lg font-bold text-primary-foreground"
                  style={{
                    background: `linear-gradient(135deg, ${review.avatarColor}, #74441f)`,
                  }}
                  aria-hidden
                >
                  {review.name.charAt(0)}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{review.name}</p>
                  <Badge variant="outline" className="mt-0.5 text-[10px]">
                    {review.service}
                  </Badge>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
