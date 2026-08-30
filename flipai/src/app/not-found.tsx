import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div>
        <p className="font-display text-6xl font-extrabold tracking-tight text-primary">
          404
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">הדף לא נמצא</h1>
        <p className="mt-1 text-muted-foreground">
          ייתכן שהקישור שגוי או שהדף הוסר.
        </p>
      </div>
      <Link href="/">
        <Button>חזרה לדף הבית</Button>
      </Link>
    </div>
  );
}
