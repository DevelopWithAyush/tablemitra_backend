import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import router from "./router.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { Request, Response } from "express";
import { connectDB } from "./infra/db/db.js";
import { connectRedis } from "./infra/redis/redis.js";
import { connectRabbitMQ } from "./infra/rabbitmq/rabbtmq.js";
import { initAWS } from "./infra/aws/aws.js";
import { requestLogger } from "./helpers/logger/requestLogger.js";
import logger from "./helpers/logger/index.js";
import cookieParser from "cookie-parser";
import { swaggerDocs } from "./swagger/swagger.js";
import { appValidator } from "./middleware/app-validator.middleware.js";
import { startAttachmentCleanupJob } from "./modules/attachments/attach.cleanup.js";

dotenv.config();

const app = express();

app.use(requestLogger);

connectDB(process.env.MONGO_URL as string);
connectRedis(process.env.REDIS_URL as string);
connectRabbitMQ(process.env.RABBITMQ_URL as string);
initAWS();

// Start background jobs
startAttachmentCleanupJob();

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'https://admin.tablemitra.com', 'https://tablemitra.com'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

swaggerDocs(app);

app.get("/", (req: Request, res: Response) => {
    res.redirect("https://www.tablemitra.com");
});

app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: "Server is running properly and healthy"
    });
});

app.use("/api/v1/:app", appValidator, router);

app.use(errorMiddleware);
app.listen(process.env.PORT, () => {
    logger.info(`Server is running on port ${process.env.PORT}`);
});