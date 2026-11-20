
import { Router } from "express";
import { ObjectId } from "mongodb";

import { database } from "../config/db.js";
import { verifyRenter } from "../middlewares/role.middleware.js";

import type { Favorite } from "../types/favorite.types.js";
import type { Equipment } from "../types/equipment.types.js";

const router = Router();

const favoritesCollection =
  database.collection<Favorite>("favorites");

const equipmentCollection =
  database.collection<Equipment>("equipment");

// ==========================================
// 1. Add Equipment to Favorites
// ==========================================

router.post(
  "/:equipmentId",
  verifyRenter,
  async (req, res) => {
    try {
      const { equipmentId } = req.params;

      if (
        typeof equipmentId !== "string" ||
        !ObjectId.isValid(equipmentId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const equipmentObjectId = new ObjectId(equipmentId);

      const equipment = await equipmentCollection.findOne({
        _id: equipmentObjectId,
        status: "Approved",
      });

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: "Approved equipment not found.",
        });
      }

      const userId = req.user!.id;

      const result = await favoritesCollection.updateOne(
        {
          userId,
          equipmentId: equipmentObjectId,
        },
        {
          $setOnInsert: {
            userId,
            equipmentId: equipmentObjectId,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      return res.status(result.upsertedCount > 0 ? 201 : 200).json({
        success: true,
        message:
          result.upsertedCount > 0
            ? "Equipment added to favorites!"
            : "Equipment is already in favorites.",
      });
    } catch (error) {
      console.error("Add favorite error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add favorite.",
      });
    }
  }
);

// ==========================================
// 2. Get Customer's Favorites
// ==========================================

router.get(
  "/",
  verifyRenter,
  async (req, res) => {
    try {
      const userId = req.user!.id;

      const favorites = await favoritesCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray();

      const equipmentIds = favorites.map(
        (favorite) => favorite.equipmentId
      );

      const equipment = await equipmentCollection
        .find({
          _id: { $in: equipmentIds },
          status: "Approved",
        })
        .toArray();

      const equipmentMap = new Map(
        equipment.map((item) => [item._id.toString(), item])
      );

      const favoriteItems = favorites
        .map((favorite) => {
          const item = equipmentMap.get(
            favorite.equipmentId.toString()
          );

          if (!item) return null;

          return {
            ...item,
            favoritedAt: favorite.createdAt,
          };
        })
        .filter((item) => item !== null);

      return res.status(200).json({
        success: true,
        total: favoriteItems.length,
        favorites: favoriteItems,
      });
    } catch (error) {
      console.error("Get favorites error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch favorites.",
      });
    }
  }
);

// ==========================================
// 3. Remove Equipment from Favorites
// ==========================================

router.delete(
  "/:equipmentId",
  verifyRenter,
  async (req, res) => {
    try {
      const { equipmentId } = req.params;

      if (
        typeof equipmentId !== "string" ||
        !ObjectId.isValid(equipmentId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const result = await favoritesCollection.deleteOne({
        userId: req.user!.id,
        equipmentId: new ObjectId(equipmentId),
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          success: false,
          message: "Favorite not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Removed from favorites successfully!",
      });
    } catch (error) {
      console.error("Remove favorite error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to remove favorite.",
      });
    }
  }
);

export default router;
