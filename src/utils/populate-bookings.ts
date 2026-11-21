
import { ObjectId } from "mongodb";
import { database } from "../config/db.js";

import type { Booking } from "../types/booking.types.js";

const userCollection = database.collection("user");
const equipmentCollection = database.collection("equipment");

interface UserSummary {
  name?: string;
  email?: string;
  image?: string;
}

interface EquipmentSummary {
  name?: string;
  image?: string;
  category?: string;
  location?: string;
}

export interface PopulatedBooking extends Booking {
  customer?: { id: string } & UserSummary;
  owner?: { id: string } & UserSummary;
  equipment?: { id: string } & EquipmentSummary;
}

const toObjectIds = (ids: string[]): ObjectId[] =>
  ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

/**
 * Enriches raw booking documents with the customer, owner and equipment
 * summaries the dashboard tables display (names instead of bare IDs).
 */
export const populateBookings = async (
  bookings: Booking[]
): Promise<PopulatedBooking[]> => {
  if (bookings.length === 0) return [];

  const equipmentIds = bookings
    .map((booking) => booking.equipmentId)
    .filter((id): id is ObjectId => Boolean(id));

  const userIds = [
    ...new Set([
      ...bookings.map((booking) => booking.customerId),
      ...bookings.map((booking) => booking.ownerId),
    ]),
  ];

  const [equipmentDocs, userDocs] = await Promise.all([
    equipmentCollection
      .find({ _id: { $in: equipmentIds } })
      .project({ name: 1, image: 1, category: 1, location: 1 })
      .toArray(),
    userCollection
      .find({ _id: { $in: toObjectIds(userIds) } })
      .project({ name: 1, email: 1, image: 1 })
      .toArray(),
  ]);

  const equipmentById = new Map(
    equipmentDocs.map((doc) => [String(doc._id), doc as EquipmentSummary])
  );
  const userById = new Map(
    userDocs.map((doc) => [String(doc._id), doc as UserSummary])
  );

  return bookings.map((booking) => {
    const customer = userById.get(booking.customerId);
    const owner = userById.get(booking.ownerId);
    const equipment = booking.equipmentId
      ? equipmentById.get(String(booking.equipmentId))
      : undefined;

    return {
      ...booking,
      ...(customer
        ? {
            customer: {
              id: booking.customerId,
              name: customer.name,
              email: customer.email,
              image: customer.image,
            },
          }
        : {}),
      ...(owner
        ? {
            owner: {
              id: booking.ownerId,
              name: owner.name,
              email: owner.email,
              image: owner.image,
            },
          }
        : {}),
      ...(equipment
        ? {
            equipment: {
              id: String(booking.equipmentId),
              name: equipment.name,
              image: equipment.image,
              category: equipment.category,
              location: equipment.location,
            },
          }
        : {}),
    };
  });
};
