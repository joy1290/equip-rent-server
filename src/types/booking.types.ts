
import { ObjectId } from "mongodb";

export type PaymentStatus = "Pending" | "Paid" | "Failed" | "Refunded";

export type BookingStatus =
  | "Pending"
  | "Confirmed"
  | "Completed"
  | "Cancelled";

export interface Booking {
  _id?: ObjectId;
  customerId: string;
  ownerId: string;
  equipmentId: ObjectId;
  startDate: Date;
  endDate: Date;
  quantity: number;
  contactNumber: string;
  deliveryAddress: string;
  additionalNotes?: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
}
