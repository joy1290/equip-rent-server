
import cron from "node-cron";

import { database } from "../config/db.js";

import type { Booking } from "../types/booking.types.js";

const bookingCollection = database.collection<Booking>("bookings");

/**
 * Marks every Confirmed booking whose rental end date has passed as
 * Completed. Returns how many bookings were updated.
 */
export const runBookingStatusUpdate = async (): Promise<number> => {
  const now = new Date();

  const result = await bookingCollection.updateMany(
    {
      bookingStatus: "Confirmed",
      endDate: { $lt: now },
    },
    {
      $set: {
        bookingStatus: "Completed",
        updatedAt: now,
      },
    }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[cron] Marked ${result.modifiedCount} overdue booking(s) as Completed.`
    );
  }

  return result.modifiedCount;
};

let jobStarted = false;

/**
 * Optional requirement: automated booking status update with node-cron.
 * Runs every hour while the server process is alive (skipped bookings
 * are also caught by the next run, so no rental can stay open forever).
 */
export const startBookingStatusJob = (): void => {
  // Guard against double-starting during dev hot reloads
  if (jobStarted) return;
  jobStarted = true;

  cron.schedule("0 * * * *", async () => {
    try {
      await runBookingStatusUpdate();
    } catch (error) {
      console.error("[cron] Booking status update failed:", error);
    }
  });

  console.log("[cron] Booking status job scheduled (hourly).");
};
