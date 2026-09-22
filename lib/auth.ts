import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectToDatabase } from "./db";
import { User } from "./models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      id: "demo-login",
      name: "Google Quick Sign-in",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
        username: { label: "Username", type: "text" },
        avatar: { label: "Avatar", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const email = credentials.email.toLowerCase().trim();
        const name = credentials.name || "Sanket";
        const username =
          credentials.username?.toLowerCase().trim() ||
          email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");

        const dbRes = await connectToDatabase();

        if (dbRes.isConnected) {
          try {
            let existingUser = await User.findOne({ email });
            if (!existingUser) {
              const coupleCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              existingUser = await User.create({
                email,
                name,
                username,
                avatar: credentials.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                coupleCode,
                status: "online",
              });
            }
            return {
              id: existingUser._id.toString(),
              name: existingUser.name,
              email: existingUser.email,
              image: existingUser.avatar,
              username: existingUser.username,
            };
          } catch (err) {
            console.error("Credentials authorize DB error:", err);
          }
        }

        // Fallback user object
        return {
          id: `usr_${username}`,
          name: name,
          email: email,
          image: credentials.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
          username: username,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
      }
      if (trigger === "update" && session?.username) {
        token.username = session.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "usly_romantic_couples_secret_key_2026_dev",
};
