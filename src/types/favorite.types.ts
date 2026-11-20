
import { ObjectId } from "mongodb";

export interface Favorite {
  _id?: ObjectId;
  userId: string;
  equipmentId: ObjectId;
  createdAt: Date;
}
