import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { ScrollProgress } from "@/components/effects/ScrollProgress";
import { CustomCursor } from "@/components/effects/CustomCursor";
import { BookingProvider } from "@/components/sections/booking/BookingContext";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Services } from "@/components/sections/Services";
import { Gallery } from "@/components/sections/Gallery";
import { Team } from "@/components/sections/Team";
import { Booking } from "@/components/sections/Booking";
import { Reviews } from "@/components/sections/Reviews";
import { Contact } from "@/components/sections/Contact";

export default function Home() {
  return (
    <BookingProvider>
      <ScrollProgress />
      <CustomCursor />
      <Navbar />
      <main id="main">
        <Hero />
        <About />
        <Services />
        <Gallery />
        <Team />
        <Booking />
        <Reviews />
        <Contact />
      </main>
      <Footer />
      <WhatsAppButton />
    </BookingProvider>
  );
}
