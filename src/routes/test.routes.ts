
import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";

const router = Router();

router.get(
  "/profile",
  verifyToken,
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
  verifyAdmin,
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome Admin!",
    });
  }
);

export default router;
