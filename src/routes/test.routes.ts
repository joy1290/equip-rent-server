
import { Router } from "express";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.get(
  "/profile",
  authenticateUser,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Authenticated successfully!",
      user: req.user,
    });
  }
);

router.get(
  "/admin",
  authenticateUser,
  authorizeRoles("admin"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome Admin!",
    });
  }
);

export default router;
