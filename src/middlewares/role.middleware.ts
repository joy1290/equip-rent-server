
import type { Request, Response, NextFunction } from "express";

type UserRole = "customer" | "owner" | "admin";

export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & {
      user?: { role?: UserRole };
    }).user;

    console.log("User role:", user?.role);
    console.log("Allowed roles:", allowedRoles);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    if (!user.role || !allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission.",
      });
    }

    next();
  };
};