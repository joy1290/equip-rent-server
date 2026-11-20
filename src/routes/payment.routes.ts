
import { Router } from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import { getStripe } from "../config/stripe.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

import type { Booking } from "../types/booking.types.js";
import type { Payment } from "../types/payment.types.js";

const router = Router();

const bookingCollection = database.collection<Booking>("bookings");
const paymentCollection = database.collection<Payment>("payments");

// ==========================================
// 1. Verify Stripe Checkout Session
// ==========================================

router.get("/verify-session", verifyToken, async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return res.status(400).json({
        success: false,
        message: "Valid Stripe session ID is required.",
      });
    }

    const stripe = getStripe();

    // Retrieve actual session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const bookingId = session.metadata?.bookingId;
    const customerId = session.metadata?.customerId;

    // Verify Stripe payment
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      !bookingId ||
      !customerId ||
      customerId !== req.user!.id ||
      !ObjectId.isValid(bookingId) ||
      session.amount_total === null ||
      session.currency !== "bdt"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    const bookingObjectId = new ObjectId(bookingId);

    // Find customer booking
    const booking = await bookingCollection.findOne({
      _id: bookingObjectId,
      customerId: req.user!.id,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Verify booking amount
    const expectedAmount = Math.round(booking.totalAmount * 100);

    if (
      !Number.isFinite(booking.totalAmount) ||
      booking.totalAmount <= 0 ||
      session.amount_total !== expectedAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match booking amount.",
      });
    }

    if (
      booking.paymentStatus !== "Pending" &&
      booking.paymentStatus !== "Paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "Booking is not eligible for payment verification.",
      });
    }

    // Update booking status
    await bookingCollection.updateOne(
      {
        _id: bookingObjectId,
        customerId: req.user!.id,
        paymentStatus: "Pending",
      },
      {
        $set: {
          paymentStatus: "Paid",
          updatedAt: new Date(),
        },
      }
    );

    const transactionId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.id;

    // Insert or update payment record
    await paymentCollection.updateOne(
      {
        stripeSessionId: session.id,
      },
      {
        $set: {
          bookingId: bookingObjectId,
          customerId: req.user!.id,
          amount: session.amount_total / 100,
          currency: session.currency,
          transactionId,
          status: "Paid",
        },
        $setOnInsert: {
          stripeSessionId: session.id,
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      paymentStatus: "Paid",
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment.",
    });
  }
});

// ==========================================
// 2. Create Stripe Checkout Session
// ==========================================

router.post(
  "/create-checkout-session",
  verifyToken,
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId || !ObjectId.isValid(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "Valid booking ID is required.",
        });
      }

      const booking = await bookingCollection.findOne({
        _id: new ObjectId(bookingId),
        customerId: req.user!.id,
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      if (booking.bookingStatus !== "Confirmed") {
        return res.status(400).json({
          success: false,
          message: "Your booking must be approved first.",
        });
      }

      if (booking.paymentStatus !== "Pending") {
        return res.status(400).json({
          success: false,
          message: "This booking is not available for payment.",
        });
      }

      if (
        !Number.isFinite(booking.totalAmount) ||
        booking.totalAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking amount.",
        });
      }

      const stripe = getStripe();

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: {
                name: "EquipRent Equipment Rental",
                description: `Booking ID: ${bookingId}`,
              },
              unit_amount: Math.round(booking.totalAmount * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId: booking._id!.toString(),
          customerId: req.user!.id,
        },
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      });

      return res.status(200).json({
        success: true,
        message: "Checkout session created successfully.",
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Stripe checkout error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create checkout session.",
      });
    }
  }
);

// ==========================================
// 3. Get Customer Payment History
// ==========================================

router.get("/history", verifyToken, async (req, res) => {
  try {
    const payments = await paymentCollection
      .find({
        customerId: req.user!.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully.",
      data: payments,
    });
  } catch (error) {
    console.error("Payment history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment history.",
    });
  }
});

// ==========================================
// 4. Export Router
// ==========================================

export default router;
