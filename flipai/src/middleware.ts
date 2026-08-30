export { default } from "next-auth/middleware";

// Protect the authenticated app surface. Unauthenticated users are sent to
// /login (configured via NextAuth `pages.signIn`).
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/analyze/:path*",
    "/products/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
  ],
};
