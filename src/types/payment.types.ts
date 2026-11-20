
import { ObjectId } from "mongodb";

export interface Payment {
  _id?: ObjectId;
  bookingId: ObjectId;
  customerId: string;
  amount: number;
  currency: string;
  transactionId: string;
  stripeSessionId: string;
  status: "Pending" | "Paid" | "Failed" | "Refunded";
  createdAt: Date;
}
