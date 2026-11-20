
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";

import { connectDB, database } from "./config/db.js";
import { auth } from "./lib/auth.js";

import testRoutes from "./routes/test.routes.js";
import equipmentRoutes from "./routes/equipment.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.routes.js";
import userRoutes from "./routes/user.routes.js";
import favoriteRoutes from "./routes/favorite.routes.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Better Auth
app.all("/api/auth/*splat", toNodeHandler(auth));

// Stripe webhook must be before express.json()
app.use("/api/payments/webhook", stripeWebhookRoutes);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "EquipRent Server is running!",
  });
});

// API routes
app.use("/api/test", testRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/favorites", favoriteRoutes);

// Initialize database once and reuse the connection
let initializationPromise: Promise<void> | null = null;

const initializeServer = async () => {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await connectDB();

      const favoritesCollection = database.collection("favorites");

      await favoritesCollection.createIndex(
        { userId: 1, equipmentId: 1 },
        {
          unique: true,
          name: "unique_user_equipment_favorite",
        }
      );
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
};

// Vercel Serverless entry point
const handler: express.RequestHandler = (req, res) => {
  initializeServer()
    .then(() => {
      app(req, res);
    })
    .catch((error) => {
      console.error("Server initialization failed:", error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Server initialization failed.",
        });
      }
    });
};

export default handler;

// Local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;

  const startServer = async () => {
    try {
      await initializeServer();

      app.listen(PORT, () => {
        console.log(`EquipRent server running on port ${PORT}`);
      });
    } catch (error) {
      console.error("Server startup failed:", error);
      process.exit(1);
    }
  };

  startServer();
}
