
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";

import type { Booking } from "../types/booking.types.js";

const userCollection = database.collection("user");
const equipmentCollection = database.collection("equipment");

interface Recipient {
  name?: string;
  email?: string;
}

/**
 * Email is optional: without SMTP_* environment variables the server
 * simply logs that notifications were skipped (nothing crashes).
 */
export const isMailConfigured = (): boolean =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);

    transporter = createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
};

const formatDate = (value: Date) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const buildHtml = (
  headline: string,
  booking: Booking,
  equipmentName: string,
  counterpartName: string
): string => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
    <div style="background: #4f46e5; padding: 18px 24px; border-radius: 10px 10px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">EquipRent</h1>
    </div>
    <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 10px 10px;">
      <h2 style="margin-top: 0; font-size: 17px; color: #4f46e5;">${headline}</h2>
      <p>Hello ${counterpartName || "there"},</p>
      <p>
        Your rental of <strong>${equipmentName}</strong> has been
        <strong>completed</strong>. We hope it went well!
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Equipment</td>
          <td style="padding: 8px 0; text-align: right;"><strong>${equipmentName}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Rental period</td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(booking.startDate)} – ${formatDate(booking.endDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Quantity</td>
          <td style="padding: 8px 0; text-align: right;">${booking.quantity}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Total amount</td>
          <td style="padding: 8px 0; text-align: right;"><strong>৳${Number(booking.totalAmount).toLocaleString("en-BD")}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Payment</td>
          <td style="padding: 8px 0; text-align: right;">${booking.paymentStatus}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Booking status</td>
          <td style="padding: 8px 0; text-align: right; color: #059669;"><strong>Completed</strong></td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #9ca3af;">
        This is an automated notification from EquipRent.
      </p>
    </div>
  </div>
`;

/**
 * Optional requirement: email the renter and the equipment owner when a
 * booking is completed. Failures never break the booking flow — they are
 * logged and retried on nothing (status is already updated).
 */
export const sendBookingCompletedEmails = async (
  bookings: Booking[]
): Promise<void> => {
  if (bookings.length === 0) return;

  if (!isMailConfigured()) {
    console.log(
      "[mail] SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS) — completion emails skipped."
    );
    return;
  }

  const equipmentIds = bookings
    .map((booking) => booking.equipmentId)
    .filter((id): id is ObjectId => Boolean(id));

  const userIds = [
    ...new Set([
      ...bookings.map((booking) => booking.customerId),
      ...bookings.map((booking) => booking.ownerId),
    ]),
  ].filter((id) => ObjectId.isValid(id));

  const [equipmentDocs, userDocs] = await Promise.all([
    equipmentCollection
      .find({ _id: { $in: equipmentIds } })
      .project({ name: 1 })
      .toArray(),
    userCollection
      .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
      .project({ name: 1, email: 1 })
      .toArray(),
  ]);

  const equipmentNameById = new Map(
    equipmentDocs.map((doc) => [String(doc._id), String(doc.name || "Equipment")])
  );
  const userById = new Map(
    userDocs.map((doc) => [String(doc._id), doc as Recipient])
  );

  const mailer = getTransporter();
  const from = process.env.MAIL_FROM || "EquipRent <no-reply@equiprent.com>";

  for (const booking of bookings) {
    const customer = userById.get(booking.customerId);
    const owner = userById.get(booking.ownerId);
    const equipmentName =
      equipmentNameById.get(String(booking.equipmentId)) || "Equipment";

    const jobs: Promise<unknown>[] = [];

    if (customer?.email) {
      jobs.push(
        mailer.sendMail({
          from,
          to: customer.email,
          subject: `Your rental of ${equipmentName} is complete`,
          html: buildHtml(
            "Rental completed",
            booking,
            equipmentName,
            customer.name || "customer"
          ),
        })
      );
    }

    if (owner?.email) {
      jobs.push(
        mailer.sendMail({
          from,
          to: owner.email,
          subject: `A rental of your ${equipmentName} was completed`,
          html: buildHtml(
            "Rental completed for your equipment",
            booking,
            equipmentName,
            owner.name || "owner"
          ),
        })
      );
    }

    const results = await Promise.allSettled(jobs);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          "[mail] Failed to send completion email:",
          result.reason
        );
      }
    }
  }

  console.log(`[mail] Completion notifications processed for ${bookings.length} booking(s).`);
};
