import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./infra/db/db.js";
import { connectRabbitMQ } from "./infra/rabbitmq/rabbtmq.js";
import { startOrderConsumer } from "./modules/analytics/order.consumer.js";
import { startCheckoutConsumer } from "./modules/analytics/checkout.consumer.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
    res.status(200).json({ success: true, message: "Analytics Service is healthy" });
});

const start = async (): Promise<void> => {
    const PORT = process.env.PORT;
    const MONGO_URL = process.env.MONGO_URL;
    const RABBITMQ_URL = process.env.RABBITMQ_URL;

    await connectDB(MONGO_URL as string);
    await connectRabbitMQ(RABBITMQ_URL as string);
    await startOrderConsumer();
    await startCheckoutConsumer();

    app.listen(PORT, () => {
        console.log(`[Analytics Service] Running on port ${PORT}`);
    });
};

start().catch((error) => {
    console.error("[Analytics Service] Failed to start:", error);
    process.exit(1);
});