
import { z } from "zod";

export const equipmentSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(10, "Description is too short"),

  category: z.enum([
    "Construction Equipment",
    "Photography Equipment",
    "Vehicles & Transportation",
    "Agriculture Equipment",
    "Electronics",
    "Event Equipment",
  ]),

  location: z.string().min(2),
  rentalPrice: z.number().positive(),
  rentalType: z.enum(["Daily", "Weekly", "Monthly"]),
  availableQuantity: z.number().int().positive(),

  condition: z.string().min(2),
  brand: z.string().min(2),
  model: z.string().min(1),
  image: z.string().url(),
  rentalTerms: z.string().min(5),
});

export type EquipmentInput = z.infer<typeof equipmentSchema>;
