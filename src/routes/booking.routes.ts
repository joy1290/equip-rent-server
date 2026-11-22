
import { Router } from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  verifyRenter,
  verifyOwner,
  verifyAdmin,
} from "../middlewares/role.middleware.js";

import type { Booking } from "../types/booking.types.js";
import { populateBookings } from "../utils/populate-bookings.js";

const router = Router();

const bookingCollection = database.collection<Booking>("bookings");
const equipmentCollection = database.collection("equipment");
const paymentCollection = database.collection("payments");

// ========================================
// GET: Customer's bookings
// ========================================
router.get("/my-bookings", verifyToken, async (req, res) => {
  try {
    const bookings = await bookingCollection
      .find({ customerId: req.user!.id })
      .sort({ createdAt: -1 })
      .toArray();

    const populatedBookings = await populateBookings(bookings);

    return res.status(200).json({
      success: true,
      message: "My bookings fetched successfully.",
      data: populatedBookings,
    });
  } catch (error) {
    console.error("Get my bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings.",
    });
  }
});

// ========================================
// GET: Owner's bookings
// ========================================
router.get("/owner-bookings", verifyOwner, async (req, res) => {
  try {
    const bookings = await bookingCollection
      .find({ ownerId: req.user!.id })
      .sort({ createdAt: -1 })
      .toArray();

    const populatedBookings = await populateBookings(bookings);

    return res.status(200).json({
      success: true,
      message: "Owner bookings fetched successfully.",
      data: populatedBookings,
    });
  } catch (error) {
    console.error("Get owner bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch owner bookings.",
    });
  }
});

// ========================================
// GET: Owner Dashboard Analytics
// ========================================
router.get("/owner/analytics", verifyOwner, async (req, res) => {
  try {
    const ownerId = req.user!.id;

    const [
      totalEquipment,
      approvedEquipment,
      pendingEquipment,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      paymentStats,
      monthlyRevenue,
    ] = await Promise.all([
      equipmentCollection.countDocuments({ ownerId }),

      equipmentCollection.countDocuments({
        ownerId,
        status: "Approved",
      }),

      equipmentCollection.countDocuments({
        ownerId,
        status: "Pending",
      }),

      bookingCollection.countDocuments({ ownerId }),

      bookingCollection.countDocuments({
        ownerId,
        bookingStatus: "Pending",
      }),

      bookingCollection.countDocuments({
        ownerId,
        bookingStatus: "Confirmed",
      }),

      bookingCollection.countDocuments({
        ownerId,
        bookingStatus: "Completed",
      }),

      bookingCollection.countDocuments({
        ownerId,
        bookingStatus: "Cancelled",
      }),

      // Total paid revenue belonging to this owner
      paymentCollection
        .aggregate<{
          totalRevenue: number;
          paidTransactions: number;
        }>([
          {
            $match: {
              status: "Paid",
            },
          },
          {
            $lookup: {
              from: "bookings",
              localField: "bookingId",
              foreignField: "_id",
              as: "booking",
            },
          },
          {
            $unwind: "$booking",
          },
          {
            $match: {
              "booking.ownerId": ownerId,
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$amount",
              },
              paidTransactions: {
                $sum: 1,
              },
            },
          },
        ])
        .toArray(),

      // Monthly paid revenue
      paymentCollection
        .aggregate<{
          year: number;
          month: number;
          revenue: number;
        }>([
          {
            $match: {
              status: "Paid",
            },
          },
          {
            $lookup: {
              from: "bookings",
              localField: "bookingId",
              foreignField: "_id",
              as: "booking",
            },
          },
          {
            $unwind: "$booking",
          },
          {
            $match: {
              "booking.ownerId": ownerId,
            },
          },
          {
            $group: {
              _id: {
                year: {
                  $year: "$createdAt",
                },
                month: {
                  $month: "$createdAt",
                },
              },
              revenue: {
                $sum: "$amount",
              },
            },
          },
          {
            $project: {
              _id: 0,
              year: "$_id.year",
              month: "$_id.month",
              revenue: 1,
            },
          },
          {
            $sort: {
              year: 1,
              month: 1,
            },
          },
        ])
        .toArray(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Owner analytics fetched successfully.",
      data: {
        equipment: {
          total: totalEquipment,
          approved: approvedEquipment,
          pending: pendingEquipment,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
        },
        revenue: {
          total: paymentStats[0]?.totalRevenue ?? 0,
          paidTransactions: paymentStats[0]?.paidTransactions ?? 0,
        },
        monthlyRevenue,
      },
    });
  } catch (error) {
    console.error("Owner analytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch owner analytics.",
    });
  }
});

// ========================================
// GET: Admin all bookings
// ========================================
router.get("/admin/all-bookings", verifyAdmin, async (_req, res) => {
  try {
    const bookings = await bookingCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const populatedBookings = await populateBookings(bookings);

    return res.status(200).json({
      success: true,
      message: "All bookings fetched successfully.",
      total: populatedBookings.length,
      data: populatedBookings,
    });
  } catch (error) {
    console.error("Get all bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch all bookings.",
    });
  }
});

// ========================================
// POST: Create booking
// ========================================
router.post("/", verifyRenter, async (req, res) => {
  try {
    const {
      equipmentId,
      startDate,
      endDate,
      quantity,
      contactNumber,
      deliveryAddress,
      additionalNotes,
    } = req.body ?? {};

    if (
      !equipmentId ||
      !startDate ||
      !endDate ||
      quantity === undefined ||
      !contactNumber?.trim?.() ||
      !deliveryAddress?.trim?.()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required booking information.",
      });
    }

    if (
      typeof equipmentId !== "string" ||
      !ObjectId.isValid(equipmentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID.",
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer.",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid rental dates.",
      });
    }

    const equipment = await equipmentCollection.findOne({
      _id: new ObjectId(equipmentId),
      status: "Approved",
    });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or not approved.",
      });
    }

    const availableQuantity = Number(equipment.availableQuantity);

    if (
      !Number.isInteger(availableQuantity) ||
      availableQuantity < quantity
    ) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity is not available.",
      });
    }

    const rentalPrice = Number(equipment.rentalPrice);

    if (!Number.isFinite(rentalPrice) || rentalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment rental price.",
      });
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    const days = Math.ceil(
      (end.getTime() - start.getTime()) / millisecondsPerDay
    );

    let duration = days;

    const rentalType = String(equipment.rentalType).toLowerCase();

    if (rentalType === "weekly") {
      duration = Math.ceil(days / 7);
    } else if (rentalType === "monthly") {
      duration = Math.ceil(days / 30);
    }

    const totalAmount = rentalPrice * duration * quantity;

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to calculate booking amount.",
      });
    }

    const booking: Booking = {
      customerId: req.user!.id,
      ownerId: equipment.ownerId,
      equipmentId: new ObjectId(equipmentId),
      startDate: start,
      endDate: end,
      quantity,
      contactNumber: contactNumber.trim(),
      deliveryAddress: deliveryAddress.trim(),
      additionalNotes:
        typeof additionalNotes === "string"
          ? additionalNotes.trim()
          : "",
      totalAmount,
      paymentStatus: "Pending",
      bookingStatus: "Pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await bookingCollection.insertOne(booking);

    return res.status(201).json({
      success: true,
      message: "Booking request submitted successfully!",
      bookingId: result.insertedId,
      booking: {
        ...booking,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking.",
    });
  }
});

// ========================================
// PATCH: Update booking status
// ========================================
router.patch("/:id/status", verifyOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus } = req.body ?? {};

    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    if (!["Confirmed", "Cancelled"].includes(bookingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Confirmed or Cancelled.",
      });
    }

    const result = await bookingCollection.updateOne(
      {
        _id: new ObjectId(id),
        ownerId: req.user!.id,
        bookingStatus: "Pending",
      },
      {
        $set: {
          bookingStatus,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending booking not found for this owner.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Booking ${bookingStatus.toLowerCase()} successfully.`,
    });
  } catch (error) {
    console.error("Update booking status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update booking status.",
    });
  }
});

// ========================================
// PATCH: Complete booking
// ========================================
router.patch("/:id/complete", verifyOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const result = await bookingCollection.updateOne(
      {
        _id: new ObjectId(id),
        ownerId: req.user!.id,
        bookingStatus: "Confirmed",
        paymentStatus: "Paid",
        endDate: { $lte: new Date() },
      },
      {
        $set: {
          bookingStatus: "Completed",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Only paid and confirmed bookings with an ended rental period can be completed.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking completed successfully.",
    });
  } catch (error) {
    console.error("Complete booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete booking.",
    });
  }
});

export default router;
