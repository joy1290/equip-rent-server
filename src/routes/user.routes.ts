
import { Router } from "express";
import { ObjectId } from "mongodb";
import { database } from "../config/db.js";

import { type AuthenticatedRequest } from "../middlewares/auth.middleware.js";

import { verifyAdmin } from "../middlewares/role.middleware.js";

const router = Router();

const userCollection = database.collection("user");

const allowedRoles = ["customer", "owner", "admin"] as const;

// ==========================================
// Admin: Get All Users
// ==========================================

router.get(
  "/",
  verifyAdmin,
  async (_req, res) => {
    try {
      const users = await userCollection
        .find(
          {},
          {
            projection: {
              _id: 1,
              name: 1,
              email: 1,
              role: 1,
              emailVerified: 1,
              createdAt: 1,
            },
          }
        )
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        total: users.length,
        users,
      });
    } catch (error) {
      console.error("Get users error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch users.",
      });
    }
  }
);

// ==========================================
// Admin: Update User Role
// ==========================================

router.patch(
  "/:id/role",
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const authenticatedUser = (req as AuthenticatedRequest).user;

      if (!authenticatedUser) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      // Validate User ID
      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      // Validate Role
      if (
        typeof role !== "string" ||
        !allowedRoles.includes(role as (typeof allowedRoles)[number])
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid role.",
        });
      }

      // Prevent Admin from changing their own role
      if (authenticatedUser.id === id) {
        return res.status(403).json({
          success: false,
          message: "You cannot change your own role.",
        });
      }

      const userObjectId = new ObjectId(id);

      // Find target user
      const targetUser = await userCollection.findOne({
        _id: userObjectId,
      });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // Prevent demoting the last Admin
      if (targetUser.role === "admin" && role !== "admin") {
        const totalAdmins = await userCollection.countDocuments({
          role: "admin",
        });

        if (totalAdmins <= 1) {
          return res.status(403).json({
            success: false,
            message: "Cannot remove the last Admin.",
          });
        }
      }

      // Update User Role
      const result = await userCollection.updateOne(
        {
          _id: userObjectId,
        },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "User role updated successfully.",
      });
    } catch (error) {
      console.error("Update user role error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user role.",
      });
    }
  }
);

export default router;
