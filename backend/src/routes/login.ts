import { Router } from "express";
import { prisma } from "../lib/db.js";

export const loginRouter = Router();

loginRouter.post("/", async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });

        if (!user) {
            return res.status(404).json({
                error: "No account found",
                message: "No account found with that email. Sign up first!",
            });
        }

        return res.json({
            success: true,
            user: { id: user.id, email: user.email, goal: user.goal },
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({
            error: "Login failed",
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
});
