import { z } from "zod";

const goalEnum = z.enum([
  "lose_fat",
  "strength_and_size",
  "strength_without_size",
]);

export const signupBodySchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().min(10, "Phone number required"),
  heightCm: z.coerce.number().int().min(50).max(300),
  weightKg: z.coerce.number().min(20).max(500),
  goal: goalEnum,
  gymTravelMinutes: z.coerce.number().int().min(0).max(120),
});

export type SignupPayload = z.infer<typeof signupBodySchema>;
