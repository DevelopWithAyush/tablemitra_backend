import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const { combine, timestamp, printf, colorize, json } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
});

const isProd = process.env.NODE_ENV === "production";

const devConsole = new winston.transports.Console({
    format: combine(
        colorize(),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        logFormat
    ),
});

const prodConsole = new winston.transports.Console({
    format: combine(timestamp(), json()),
});

const errorFile = new DailyRotateFile({
    filename: "logs/error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    level: "error",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
});

export const transports = isProd
    ? [prodConsole, errorFile]
    : [devConsole];
