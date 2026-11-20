
import { Router } from "express";
import express from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import { getStripe } from "../config/stripe.js";

import type { Booking } from "../types/booking.types.js";
import type { Payment } from "../types/payment.types.js";

const router = Router();

const bookingCollection = database.collection<Booking>("bookings");
const paymentCollection = database.collection<Payment>("payments");

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      return res.status(400).send("Missing Stripe signature or webhook secret.");
    }

    let event;

    try {
      const stripe = getStripe();

      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error("Webhook signature verification failed:", error);

      return res.status(400).send("Invalid Stripe webhook signature.");
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        if (session.payment_status !== "paid") {
          return res.status(200).json({ received: true });
        }

        const bookingId = session.metadata?.bookingId;
        const customerId = session.metadata?.customerId;

        if (
          !bookingId ||
          !customerId ||
          !ObjectId.isValid(bookingId) ||
          session.amount_total === null ||
          session.amount_total <= 0 ||
          !session.currency
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment metadata.",
          });
        }

        if (session.currency.toLowerCase() !== "bdt") {
          return res.status(400).json({
            success: false,
            message: "Invalid payment currency.",
          });
        }

        const bookingObjectId = new ObjectId(bookingId);

        const booking = await bookingCollection.findOne({
          _id: bookingObjectId,
          customerId,
        });

        if (!booking) {
          console.error("Booking not found:", bookingId);

          return res.status(200).json({
            received: true,
            message: "Booking not found.",
          });
        }

        const expectedAmount = Math.round(booking.totalAmount * 100);

        if (session.amount_total !== expectedAmount) {
          console.error("Payment amount mismatch:", session.id);

          return res.status(400).json({
            success: false,
            message: "Payment amount mismatch.",
          });
        }

        await bookingCollection.updateOne(
          {
            _id: bookingObjectId,
            customerId,
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

        await paymentCollection.updateOne(
          {
            stripeSessionId: session.id,
          },
          {
            $set: {
              bookingId: bookingObjectId,
              customerId,
              amount: session.amount_total / 100,
              currency: session.currency,
              transactionId,
              stripeSessionId: session.id,
              status: "Paid",
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          {
            upsert: true,
          }
        );

        console.log("Payment successfully recorded:", session.id);
      }

      return res.status(200).json({
        received: true,
      });
    } catch (error) {
      console.error("Stripe webhook processing error:", error);

      return res.status(500).json({
        success: false,
        message: "Webhook processing failed.",
      });
    }
  }
);

export default router;
