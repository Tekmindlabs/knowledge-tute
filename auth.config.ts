import { getServerSession } from "next-auth";
import type { NextAuthConfig } from "next-auth/lib/types"; // Updated import
import type { NextURL } from "next/dist/server/web/next-url";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ 
      auth, 
      request: { nextUrl } 
    }: { 
      auth: { user: any } | null; 
      request: { nextUrl: NextURL | URL } 
    }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export async function auth() {
  return await getServerSession(authConfig);
}