
import { Router } from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import {
  type AuthenticatedRequest,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";

const router = Router();

// Collections
const userCollection = database.collection("user");
const equipmentCollection = database.collection("equipment");
const bookingCollection = database.collection("bookings");
const paymentCollection = database.collection("payments");

const allowedRoles = ["customer", "owner", "admin"] as const;

// ==========================================
// Customer / Owner / Admin: Get Own Profile
// ==========================================

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const authenticatedUser = (req as AuthenticatedRequest).user;

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const user = await userCollection.findOne(
      { _id: new ObjectId(authenticatedUser.id) },
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          image: 1,
          phone: 1,
          address: 1,
          role: 1,
          emailVerified: 1,
          createdAt: 1,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile.",
    });
  }
});

// ==========================================
// Customer / Owner / Admin: Update Own Profile
// ==========================================

router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const authenticatedUser = (req as AuthenticatedRequest).user;

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { name, phone, address, image } = req.body;

    // Validate name
    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length < 2)
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 2 characters.",
      });
    }

    // Validate phone
    if (
      phone !== undefined &&
      (typeof phone !== "string" || phone.length > 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number.",
      });
    }

    // Validate address
    if (
      address !== undefined &&
      (typeof address !== "string" || address.length > 300)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid address.",
      });
    }

    // Validate image
    if (
      image !== undefined &&
      image !== null &&
      typeof image !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile image.",
      });
    }

    const updateData: Record<string, string | Date | null> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (image !== undefined) updateData.image = image;

    const result = await userCollection.updateOne(
      { _id: new ObjectId(authenticatedUser.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const updatedUser = await userCollection.findOne(
      { _id: new ObjectId(authenticatedUser.id) },
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          image: 1,
          phone: 1,
          address: 1,
          role: 1,
          emailVerified: 1,
          createdAt: 1,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile.",
    });
  }
});

// ==========================================
// Admin: Get Dashboard Analytics
// ==========================================

router.get("/analytics", verifyAdmin, async (_req, res) => {
  try {
    const now = new Date();

    const sixMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1
    );

    const [
      totalUsers,
      customers,
      owners,
      admins,
      totalEquipment,
      approvedEquipment,
      pendingEquipment,
      rejectedEquipment,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      revenueResult,
      monthlyRevenue,
    ] = await Promise.all([
      userCollection.countDocuments(),
      userCollection.countDocuments({ role: "customer" }),
      userCollection.countDocuments({ role: "owner" }),
      userCollection.countDocuments({ role: "admin" }),

      equipmentCollection.countDocuments(),
      equipmentCollection.countDocuments({ status: "Approved" }),
      equipmentCollection.countDocuments({ status: "Pending" }),
      equipmentCollection.countDocuments({ status: "Rejected" }),

      bookingCollection.countDocuments(),
      bookingCollection.countDocuments({ bookingStatus: "Pending" }),
      bookingCollection.countDocuments({ bookingStatus: "Confirmed" }),
      bookingCollection.countDocuments({ bookingStatus: "Completed" }),
      bookingCollection.countDocuments({ bookingStatus: "Cancelled" }),

      paymentCollection.aggregate([
        { $match: { status: "Paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]).toArray(),

      paymentCollection.aggregate([
        {
          $match: {
            status: "Paid",
            createdAt: {
              $gte: sixMonthsAgo,
              $lte: now,
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$amount" },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]).toArray(),
    ]);

    const revenue = revenueResult[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          customers,
          owners,
          admins,
        },
        equipment: {
          total: totalEquipment,
          approved: approvedEquipment,
          pending: pendingEquipment,
          rejected: rejectedEquipment,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
        },
        revenue: {
          total: revenue.totalRevenue,
          paidTransactions: revenue.totalTransactions,
        },
        monthlyRevenue: monthlyRevenue.map((item) => ({
          year: item._id.year,
          month: item._id.month,
          revenue: item.revenue,
          transactions: item.transactions,
        })),
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin analytics.",
    });
  }
});

// ==========================================
// Admin: Get All Users
// ==========================================

router.get("/", verifyAdmin, async (_req, res) => {
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
});

// ==========================================
// Admin: Update User Role
// ==========================================

router.patch("/:id/role", verifyAdmin, async (req, res) => {
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

    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (
      typeof role !== "string" ||
      !allowedRoles.includes(role as (typeof allowedRoles)[number])
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid role.",
      });
    }

    if (authenticatedUser.id === id) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own role.",
      });
    }

    const userObjectId = new ObjectId(id);

    const targetUser = await userCollection.findOne({
      _id: userObjectId,
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

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

    const result = await userCollection.updateOne(
      { _id: userObjectId },
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
});

export default router;
