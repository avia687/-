"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { site } from "@/lib/site";

const waText = encodeURIComponent("היי! אשמח לקבוע תור 💈");

/** Floating WhatsApp action button that appears after the hero. */
export function WhatsAppButton() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.a
          href={`https://wa.me/${site.whatsapp}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="שלח/י הודעת WhatsApp"
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-6 left-6 z-40 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-20" />
          <MessageCircle className="relative size-7" />
        </motion.a>
      ) : null}
    </AnimatePresence>
  );
}
