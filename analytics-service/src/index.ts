import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.get("/health", (req, res) => {
    res.status(200).json({ success: true, message: "Analytics Service is healthy" });
});

app.listen(process.env.PORT as string, () => {
    console.log(`Analytics service is running on port ${process.env.PORT}`);
});