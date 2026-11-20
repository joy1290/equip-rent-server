
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { client, database } from "../config/db.js";
import { passwordPolicy } from "./password-policy.js";

const frontendUrl =
  process.env.FRONTEND_URL || "http://localhost:3000";

export const auth = betterAuth({
  appName: "EquipRent",

  database: mongodbAdapter(database, { client }),

  baseURL:
    process.env.BETTER_AUTH_URL || "http://localhost:5000",

  secret: process.env.BETTER_AUTH_SECRET,

  trustedOrigins: [
    "http://localhost:3000",
    frontendUrl,
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "customer",
        input: false,
      },
    },
  },

  plugins: [jwt(), passwordPolicy()],
});
