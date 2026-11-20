
import Stripe from "stripe";

export const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is missing from environment variables");
  }

  return new Stripe(secretKey);
};
