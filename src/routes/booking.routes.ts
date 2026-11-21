
import { Router } from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import {
  verifyToken,
} from "../middlewares/auth.middleware.js";
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

    console.log("Booking request received:", {
      equipmentId,
      startDate,
      endDate,
      quantity,
      userId: req.user?.id,
    });

    // Validate required fields
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

    // Validate equipment ID
    if (
      typeof equipmentId !== "string" ||
      !ObjectId.isValid(equipmentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID.",
      });
    }

    // Validate quantity
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer.",
      });
    }

    // Validate dates
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

    // Find approved equipment
    const equipment = await equipmentCollection.findOne({
      _id: new ObjectId(equipmentId),
      status: "Approved",
    });

    console.log("Equipment found:", Boolean(equipment));

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or not approved.",
      });
    }

    // Validate available quantity
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

    // Validate rental price
    const rentalPrice = Number(equipment.rentalPrice);

    if (!Number.isFinite(rentalPrice) || rentalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment rental price.",
      });
    }

    // Calculate rental duration
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

    if (!Number.isFinite(totalAmount)) {
      return res.status(400).json({
        success: false,
        message: "Unable to calculate booking amount.",
      });
    }

    // Create booking document
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

    console.log("Inserting booking into MongoDB...");

    // Insert booking
    const result = await bookingCollection.insertOne(booking);

    console.log("Booking inserted successfully:", result.insertedId.toString());

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

    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

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
    const id = req.params.id;

    if (
      typeof id !== "string" ||
      !ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const { bookingStatus } = req.body ?? {};

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

export default router;
