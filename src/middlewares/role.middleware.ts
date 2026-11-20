
import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthenticatedRequest } from "./auth.middleware.js";

type UserRole = "customer" | "owner" | "admin";

/**
 * Builds a Challenge 2 role middleware on top of `verifyToken`: the request
 * must carry a valid JWT *and* the decoded role must be allowed through.
 */
const requireRole = (...allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await verifyToken(req as AuthenticatedRequest, res, () => {
      const user = (req as AuthenticatedRequest).user;

      // No user means verifyToken already responded with 401.
      if (!user) return;

      if (!allowedRoles.includes(user.role as UserRole)) {
        res.status(403).json({
          success: false,
          message: "You do not have permission to access this resource.",
        });
        return;
      }

      next();
    });
  };
};

/** Challenge 2 — only logged-in Customers (Renters) may pass. */
export const verifyRenter = requireRole("customer");

/** Challenge 2 — only logged-in Equipment Owners may pass. */
export const verifyOwner = requireRole("owner");

/** Challenge 2 — only logged-in Admins may pass. */
export const verifyAdmin = requireRole("admin");
