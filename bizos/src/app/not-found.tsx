import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center" dir="rtl">
      <p className="text-5xl font-bold">404</p>
      <p className="text-muted-foreground">הדף שחיפשת לא נמצא</p>
      <Link href="/dashboard" className="font-medium text-primary hover:underline">
        חזרה לדשבורד
      </Link>
    </div>
  );
}
