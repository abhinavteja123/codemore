import { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { storeUserToken } from "./tokenStore";
import { logger, sanitizeError } from "./logger";

const githubScope =
  process.env.GITHUB_OAUTH_SCOPE ?? "read:user user:email public_repo";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: githubScope,
        },
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token && token.email) {
        // Store token in database, NOT in JWT cookie
        try {
          await storeUserToken(token.email, account.provider, account.access_token);
        } catch (error) {
          logger.error({ err: sanitizeError(error) }, "Failed to store token");
        }
        // Only store provider info, not the actual token
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      // Do NOT expose accessToken in session - fetch from DB when needed
      session.provider = token.provider as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
