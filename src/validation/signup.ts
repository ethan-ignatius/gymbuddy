import { z } from "zod";

const goalEnum = z.enum([
  "lose_fat",
  "strength_and_size",
  "strength_without_size",
]);

export const signupBodySchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "E.164 format required"),
  heightCm: z.number().int().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  goal: goalEnum,
  gymTravelMinutes: z.number().int().min(0).max(120),
});

export type SignupPayload = z.infer<typeof signupBodySchema>;
