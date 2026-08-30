import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "אימייל", type: "email" },
      password: { label: "סיסמה", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.toLowerCase().trim();
      const password = credentials?.password;
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    },
  }),
];

if (googleEnabled) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      // For Google logins, ensure a local user + free subscription exist.
      if (account?.provider === "google" && user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              role: "user",
              subscription: { create: { plan: "free", status: "active" } },
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      // On first sign-in, `user` is present. Otherwise, refresh from DB by email.
      const email = (user?.email || token.email) as string | undefined;
      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, onboardedAt: true, name: true },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.onboarded = Boolean(dbUser.onboardedAt);
          token.name = dbUser.name ?? token.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as string) ?? "user";
        session.user.onboarded = Boolean(token.onboarded);
      }
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
