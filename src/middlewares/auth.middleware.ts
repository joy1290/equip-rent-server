
import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

/**
 * verifyToken — Challenge 2: JWT token verification middleware.
 *
 * Validates the Better Auth session JWT sent by the browser — either as the
 * session cookie or as an `Authorization: Bearer <token>` header (the bearer
 * plugin is enabled in `lib/auth.ts`). On success the decoded user (with
 * role) is attached to `req.user`; otherwise a 401 JSON response is sent.
 */
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role:
        (session.user as typeof session.user & { role?: string }).role ??
        "customer",
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
