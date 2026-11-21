
import { Router } from "express";
import { ObjectId, type Filter } from "mongodb";

import { database } from "../config/db.js";
import { verifyOwner, verifyAdmin } from "../middlewares/role.middleware.js";

import type {
  Equipment,
  EquipmentStatus,
} from "../types/equipment.types.js";

import { equipmentSchema } from "../validators/equipment.validator.js";

const router = Router();

const equipmentCollection =
  database.collection<Equipment>("equipment");

const userCollection = database.collection("user");

// Escape special regex characters
const escapeRegex = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ==========================================
// 1. Add Equipment (Owner)
// ==========================================

router.post(
  "/",
  verifyOwner,
  async (req, res) => {
    try {
      const validation = equipmentSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed.",
          errors: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const equipment: Equipment = {
        ...validation.data,
        ownerId: req.user!.id,
        status: "Pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result =
        await equipmentCollection.insertOne(equipment);

      return res.status(201).json({
        success: true,
        message: "Equipment added successfully!",
        equipmentId: result.insertedId,
      });
    } catch (error) {
      console.error("Create equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add equipment.",
      });
    }
  }
);

// ==========================================
// 2. Get All Approved Equipment
// ==========================================

router.get("/", async (_req, res) => {
  try {
    const equipment = await equipmentCollection
      .find({ status: "Approved" })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: equipment.length,
      equipment,
    });
  } catch (error) {
    console.error("Get equipment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch equipment.",
    });
  }
});

// ==========================================
// 3. Search and Filter Equipment
// ==========================================

router.get("/search/filter", async (req, res) => {
  try {
    const {
      search,
      category,
      location,
      minPrice,
      maxPrice,
      rentalType,
      availability,
      sort,
      page,
      limit,
    } = req.query;

    const filter: Filter<Equipment> = {
      status: "Approved",
    };

    // Challenge 1: one search term matches name, category or location
    if (search && typeof search === "string") {
      const searchRegex = new RegExp(
        escapeRegex(search),
        "i"
      );

      filter.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { location: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
      ];
    }

    if (category && typeof category === "string") {
      filter.category = category as Equipment["category"];
    }

    if (location && typeof location === "string") {
      filter.location = {
        $regex: escapeRegex(location),
        $options: "i",
      };
    }

    if (rentalType && typeof rentalType === "string") {
      filter.rentalType =
        rentalType as Equipment["rentalType"];
    }

    const min = minPrice ? Number(minPrice) : undefined;
    const max = maxPrice ? Number(maxPrice) : undefined;

    if (
      (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid price range.",
      });
    }

    if (
      min !== undefined &&
      max !== undefined &&
      min > max
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum price cannot exceed maximum price.",
      });
    }

    if (min !== undefined || max !== undefined) {
      filter.rentalPrice = {
        ...(min !== undefined ? { $gte: min } : {}),
        ...(max !== undefined ? { $lte: max } : {}),
      };
    }

    // Challenge 1: availability filter
    if (availability === "available") {
      filter.availableQuantity = { $gt: 0 };
    } else if (availability === "unavailable") {
      filter.availableQuantity = { $lte: 0 };
    }

    // Challenge 1: server-side sorting
    let sortSpec: Record<string, 1 | -1> = {
      createdAt: -1,
    };

    if (sort === "price-asc" || sort === "price_asc" || sort === "asc") {
      sortSpec = { rentalPrice: 1 };
    } else if (
      sort === "price-desc" ||
      sort === "price_desc" ||
      sort === "desc"
    ) {
      sortSpec = { rentalPrice: -1 };
    }

    // Optional requirement: pagination
    const pageNum =
      page !== undefined && page !== "" ? Number(page) : undefined;
    const limitNum =
      limit !== undefined && limit !== "" ? Number(limit) : undefined;

    if (
      (pageNum !== undefined && (!Number.isInteger(pageNum) || pageNum < 1)) ||
      (limitNum !== undefined &&
        (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values.",
      });
    }

    const total = await equipmentCollection.countDocuments(filter);

    let cursor = equipmentCollection
      .find(filter)
      .sort(sortSpec);

    if (limitNum !== undefined) {
      cursor = cursor
        .skip(((pageNum ?? 1) - 1) * limitNum)
        .limit(limitNum);
    }

    const equipment = await cursor.toArray();

    return res.status(200).json({
      success: true,
      total,
      page: pageNum ?? 1,
      ...(limitNum !== undefined
        ? {
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          }
        : {}),
      equipment,
    });
  } catch (error) {
    console.error("Search equipment error:", error);

    return res.status(500).json({
      success: false,
      message: "Equipment search failed.",
    });
  }
});

// ==========================================
// Featured Equipment (Home Page — 6 items)
// ==========================================

router.get("/featured", async (_req, res) => {
  try {
    const equipment = await equipmentCollection
      .find({ status: "Approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    return res.status(200).json({
      success: true,
      total: equipment.length,
      equipment,
    });
  } catch (error) {
    console.error("Featured equipment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch featured equipment.",
    });
  }
});

// ==========================================
// 4. Get Owner's Equipment
// ==========================================

router.get(
  "/my-equipment",
  verifyOwner,
  async (req, res) => {
    try {
      const equipment = await equipmentCollection
        .find({ ownerId: req.user!.id })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        total: equipment.length,
        equipment,
      });
    } catch (error) {
      console.error("Owner equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch your equipment.",
      });
    }
  }
);


// ==========================================
// Admin: Get All Equipment with Status Filter
// ==========================================

router.get(
  "/admin/all",
  verifyAdmin,
  async (req, res) => {
    try {
      const { status, search } = req.query;

      const filter: Filter<Equipment> = {};

      // Filter by equipment status
      if (status && typeof status === "string" && status !== "All") {
        if (!["Pending", "Approved", "Rejected"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid equipment status.",
          });
        }

        filter.status = status as EquipmentStatus;
      }

      // Search by equipment name, brand or category
      if (search && typeof search === "string" && search.trim()) {
        const searchRegex = new RegExp(
          escapeRegex(search.trim()),
          "i"
        );

        filter.$or = [
          { name: searchRegex },
          { brand: searchRegex },
          { category: searchRegex },
          { location: searchRegex },
        ];
      }

      const equipment = await equipmentCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        total: equipment.length,
        equipment,
      });
    } catch (error) {
      console.error("Admin all equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch all equipment.",
      });
    }
  }
);



// ==========================================
// Admin: Equipment Statistics
// ==========================================

router.get(
  "/admin/stats",
  verifyAdmin,
  async (_req, res) => {
    try {
      const [total, pending, approved, rejected] =
        await Promise.all([
          equipmentCollection.countDocuments({}),
          equipmentCollection.countDocuments({ status: "Pending" }),
          equipmentCollection.countDocuments({ status: "Approved" }),
          equipmentCollection.countDocuments({ status: "Rejected" }),
        ]);

      return res.status(200).json({
        success: true,
        statistics: {
          totalEquipment: total,
          pendingEquipment: pending,
          approvedEquipment: approved,
          rejectedEquipment: rejected,
        },
      });
    } catch (error) {
      console.error("Admin equipment statistics error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch equipment statistics.",
      });
    }
  }
);


// ==========================================
// 5. Admin: Get Pending Equipment
// ==========================================

router.get(
  "/admin/pending",
  verifyAdmin,
  async (_req, res) => {
    try {
      const equipment = await equipmentCollection
        .find({ status: "Pending" })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        total: equipment.length,
        equipment,
      });
    } catch (error) {
      console.error("Pending equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch pending equipment.",
      });
    }
  }
);

// ==========================================
// 6. Admin: Approve or Reject Equipment
// ==========================================

router.patch(
  "/admin/:id/status",
  verifyAdmin,
  async (req, res) => {
    try {
     const id = req.params.id;
      const { status } = req.body as {
        status: EquipmentStatus;
      };

     if (typeof id !== "string" || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment status.",
        });
      }

      const result = await equipmentCollection.updateOne(
        {
          _id: new ObjectId(id),
          status: "Pending",
        },
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        }
      );

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Pending equipment not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: `Equipment ${status.toLowerCase()} successfully!`,
      });
    } catch (error) {
      console.error("Equipment approval error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update equipment status.",
      });
    }
  }
);


// ==========================================
// Admin: Delete Any Equipment
// ==========================================

router.delete(
  "/admin/:id",
  verifyAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const result = await equipmentCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Equipment deleted successfully!",
      });
    } catch (error) {
      console.error("Admin delete equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete equipment.",
      });
    }
  }
);


// ==========================================
// 7. Owner: Update Equipment
// ==========================================

router.patch(
  "/:id",
  verifyOwner,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const validation = equipmentSchema
        .partial()
        .safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed.",
          errors: validation.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const updates = validation.data;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please provide at least one valid field.",
        });
      }

      const result = await equipmentCollection.updateOne(
        {
          _id: new ObjectId(id),
          ownerId: req.user!.id,
        },
        {
          $set: {
            ...updates,
            status: "Pending",
            updatedAt: new Date(),
          },
        }
      );

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found or unauthorized.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Equipment updated and sent for approval!",
      });
    } catch (error) {
      console.error("Update equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update equipment.",
      });
    }
  }
);

// ==========================================
// 8. Owner: Delete Equipment
// ==========================================

router.delete(
  "/:id",
  verifyOwner,
  async (req, res) => {
    try {
      const  id  = req.params.id;

      if (typeof id !== "string" || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid equipment ID.",
        });
      }

      const result = await equipmentCollection.deleteOne({
        _id: new ObjectId(id),
        ownerId: req.user!.id,
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          success: false,
          message: "Equipment not found or unauthorized.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Equipment deleted successfully!",
      });
    } catch (error) {
      console.error("Delete equipment error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete equipment.",
      });
    }
  }
);

// ==========================================
// 9. Get Equipment Details
// ==========================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment ID.",
      });
    }

    const equipment = await equipmentCollection.findOne({
      _id: new ObjectId(id),
      status: "Approved",
    });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found.",
      });
    }

    // Owner information shown on the equipment details page
    const owner =
      ObjectId.isValid(equipment.ownerId)
        ? await userCollection
            .findOne(
              { _id: new ObjectId(equipment.ownerId) },
              { projection: { name: 1, email: 1, image: 1 } }
            )
        : null;

    return res.status(200).json({
      success: true,
      equipment: {
        ...equipment,
        owner: owner
          ? {
              name: owner.name,
              email: owner.email,
              image: owner.image,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Equipment details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch equipment details.",
    });
  }
});

export default router;
