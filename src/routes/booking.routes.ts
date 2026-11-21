
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

// ==========================================
// Customer: Get My Bookings
// ==========================================

router.get("/my-bookings", verifyToken, async (req, res) => {
  try {
    const bookings = await populateBookings(
      await bookingCollection
        .find({ customerId: req.user!.id })
        .sort({ createdAt: -1 })
        .toArray()
    );

    return res.status(200).json({
      success: true,
      message: "My bookings fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("Get my bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
});

// ==========================================
// Owner: Get Owner Bookings
// ==========================================

router.get("/owner-bookings", verifyOwner, async (req, res) => {
  try {
    const bookings = await populateBookings(
      await bookingCollection
        .find({ ownerId: req.user!.id })
        .sort({ createdAt: -1 })
        .toArray()
    );

    return res.status(200).json({
      success: true,
      message: "Owner bookings fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("Get owner bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch owner bookings.",
    });
  }
});

// ==========================================
// Admin: Get All Bookings
// ==========================================

router.get(
  "/admin/all-bookings",
  verifyAdmin,
  async (_req, res) => {
    try {
      const bookings = await populateBookings(
        await bookingCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray()
      );

      return res.status(200).json({
        success: true,
        message: "All bookings fetched successfully.",
        total: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error("Get all bookings error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch all bookings.",
      });
    }
  }
);

// ==========================================
// Customer: Create Booking
// ==========================================

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
    } = req.body;

    if (
      !equipmentId ||
      !startDate ||
      !endDate ||
      !quantity ||
      !contactNumber ||
      !deliveryAddress
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required booking information.",
      });
    }

    if (!ObjectId.isValid(equipmentId)) {
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

    if (quantity > equipment.availableQuantity) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity is not available.",
      });
    }

    const days = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    let duration = days;

    if (equipment.rentalType === "Weekly") {
      duration = Math.ceil(days / 7);
    } else if (equipment.rentalType === "Monthly") {
      duration = Math.ceil(days / 30);
    }

    const totalAmount =
      equipment.rentalPrice * duration * quantity;

    const booking: Booking = {
      customerId: req.user!.id,
      ownerId: equipment.ownerId,
      equipmentId: new ObjectId(equipmentId),
      startDate: start,
      endDate: end,
      quantity,
      contactNumber,
      deliveryAddress,
      additionalNotes: additionalNotes || "",
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

// ==========================================
// Owner: Approve or Reject Booking
// ==========================================

router.patch("/:id/status", verifyOwner, async (req, res) => {
  try {
    const id = req.params.id;

    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const { bookingStatus } = req.body;

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
