
import { Router } from "express";
import { database } from "../config/db.js";
import { verifyAdmin, verifyOwner } from "../middlewares/role.middleware.js";

import type { Booking } from "../types/booking.types.js";
import type { Payment } from "../types/payment.types.js";
import type { Equipment } from "../types/equipment.types.js";

const router = Router();

const userCollection = database.collection("user");
const equipmentCollection = database.collection<Equipment>("equipment");
const bookingCollection = database.collection<Booking>("bookings");
const paymentCollection = database.collection<Payment>("payments");

const last12Months = (): {
  month: string;
  start: Date;
  end: Date;
}[] => {
  const months: {
    month: string;
    start: Date;
    end: Date;
  }[] = [];

  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    months.push({
      month: `${start.getFullYear()}-${String(
        start.getMonth() + 1
      ).padStart(2, "0")}`,
      start,
      end,
    });
  }

  return months;
};

// ==========================================
// Admin Analytics
// ==========================================

router.get("/admin", verifyAdmin, async (_req, res) => {
  try {
    const months = last12Months();
    const twelveMonthsAgo = months[0]!.start;

    const [
      totalUsers,
      totalCustomers,
      totalOwners,
      totalAdmins,
      totalEquipment,
      approvedEquipment,
      pendingEquipment,
      rejectedEquipment,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      totalRevenueResult,
      paidTransactions,
      monthlyRevenueRows,
    ] = await Promise.all([
      userCollection.countDocuments(),
      userCollection.countDocuments({ role: "customer" }),
      userCollection.countDocuments({ role: "owner" }),
      userCollection.countDocuments({ role: "admin" }),

      equipmentCollection.countDocuments(),
      equipmentCollection.countDocuments({ status: "Approved" }),
      equipmentCollection.countDocuments({ status: "Pending" }),
      equipmentCollection.countDocuments({ status: "Rejected" }),

      bookingCollection.countDocuments(),
      bookingCollection.countDocuments({ bookingStatus: "Pending" }),
      bookingCollection.countDocuments({ bookingStatus: "Confirmed" }),
      bookingCollection.countDocuments({ bookingStatus: "Completed" }),
      bookingCollection.countDocuments({ bookingStatus: "Cancelled" }),

      paymentCollection
        .aggregate<{ total: number }>([
          { $match: { status: "Paid" } },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ])
        .toArray(),

      paymentCollection.countDocuments({ status: "Paid" }),

      paymentCollection
        .aggregate<{
          _id: string;
          revenue: number;
          transactions: number;
        }>([
          {
            $match: {
              status: "Paid",
              createdAt: { $gte: twelveMonthsAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: "$createdAt",
                },
              },
              revenue: { $sum: "$amount" },
              transactions: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    const revenueByMonth = new Map(
      monthlyRevenueRows.map((row) => [
        row._id,
        {
          revenue: row.revenue,
          transactions: row.transactions,
        },
      ])
    );

    const monthlyRevenue = months.map(({ month }) => {
      const [year, monthNumber] = month.split("-").map(Number);
      const monthlyData = revenueByMonth.get(month);

      return {
        year,
        month: monthNumber,
        revenue: monthlyData?.revenue ?? 0,
        transactions: monthlyData?.transactions ?? 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          customers: totalCustomers,
          owners: totalOwners,
          admins: totalAdmins,
        },
        equipment: {
          total: totalEquipment,
          approved: approvedEquipment,
          pending: pendingEquipment,
          rejected: rejectedEquipment,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
        },
        revenue: {
          total: totalRevenueResult[0]?.total ?? 0,
          paidTransactions,
        },
        monthlyRevenue,
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin analytics.",
    });
  }
});

// ==========================================
// Owner Analytics
// ==========================================

router.get("/owner", verifyOwner, async (req, res) => {
  try {
    const ownerId = req.user!.id;
    const months = last12Months();
    const twelveMonthsAgo = months[0]!.start;

    const [
      totalListedEquipment,
      approvedEquipment,
      pendingEquipment,
      totalBookings,
      completedRentals,
      earningsResult,
      monthlyEarningsRows,
      monthlyBookingsRows,
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
        bookingStatus: "Completed",
      }),

      paymentCollection
        .aggregate<{ total: number }>([
          { $match: { status: "Paid" } },
          {
            $lookup: {
              from: "bookings",
              localField: "bookingId",
              foreignField: "_id",
              as: "booking",
            },
          },
          { $unwind: "$booking" },
          { $match: { "booking.ownerId": ownerId } },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ])
        .toArray(),

      paymentCollection
        .aggregate<{ _id: string; total: number }>([
          {
            $match: {
              status: "Paid",
              createdAt: { $gte: twelveMonthsAgo },
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
          { $unwind: "$booking" },
          { $match: { "booking.ownerId": ownerId } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: "$createdAt",
                },
              },
              total: { $sum: "$amount" },
            },
          },
        ])
        .toArray(),

      bookingCollection
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              ownerId,
              createdAt: { $gte: twelveMonthsAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    const earningsByMonth = new Map(
      monthlyEarningsRows.map((row) => [row._id, row.total])
    );

    const bookingsByMonth = new Map(
      monthlyBookingsRows.map((row) => [row._id, row.count])
    );

    const monthlyEarnings = months.map(({ month }) => ({
      month,
      earnings: earningsByMonth.get(month) ?? 0,
      bookings: bookingsByMonth.get(month) ?? 0,
    }));

    return res.status(200).json({
      success: true,
      data: {
        totalListedEquipment,
        approvedEquipment,
        pendingEquipment,
        totalBookings,
        completedRentals,
        totalEarnings: earningsResult[0]?.total ?? 0,
        monthlyEarnings,
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

export default router;
