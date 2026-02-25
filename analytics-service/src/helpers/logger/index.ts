import winston from "winston";
import { transports } from "./transports.js";

const isProd = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
    level: isProd ? "info" : "debug",
    transports,
    exitOnError: false,
});

export default logger;
