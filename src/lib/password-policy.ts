
import { createAuthMiddleware, APIError } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";

/**
 * Password complexity rules required by the assignment:
 * - at least one uppercase letter
 * - at least one lowercase letter
 * - at least 6 characters long
 *
 * Better Auth only enforces min/max length natively, so this plugin adds a
 * `before` hook on the sign-up endpoint that rejects non-compliant passwords
 * with a 400 the client can surface as a toast.
 */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;

export const PASSWORD_POLICY_ERROR =
  "Password must contain an uppercase letter, a lowercase letter and be at least 6 characters long.";

export const passwordPolicy = (): BetterAuthPlugin => ({
  id: "password-policy",

  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-up/email",
        handler: createAuthMiddleware(async (ctx) => {
          const password = ctx.body?.password;

          if (typeof password === "string" && !PASSWORD_PATTERN.test(password)) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_PASSWORD",
              message: PASSWORD_POLICY_ERROR,
            });
          }
        }),
      },
    ],
  },
});
