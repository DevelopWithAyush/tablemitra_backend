import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./infra/db/db.js";
import { connectRabbitMQ } from "./infra/rabbitmq/rabbtmq.js";
import { startAuditConsumer } from "./modules/audit/audit.consumer.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
    res.status(200).json({ success: true, message: "Audit Service is healthy" });
});


const start = async (): Promise<void> => {
    const PORT = process.env.PORT;
    const MONGO_URL = process.env.MONGO_URL;
    const RABBITMQ_URL = process.env.RABBITMQ_URL;

    await connectDB(MONGO_URL as string);
    await connectRabbitMQ(RABBITMQ_URL as string);
    await startAuditConsumer();

    app.listen(PORT, () => {
        console.log(`[Audit Service] Running on port ${PORT}`);
    });
};

start().catch((error) => {
    console.error("[Audit Service] Failed to start:", error);
    process.exit(1);
});