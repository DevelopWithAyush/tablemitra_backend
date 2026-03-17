import morgan from "morgan";
import logger from "./index.js";
import { Request, Response } from "express";

morgan.token("message", (_req: Request, res: Response) => res.locals.errorMessage || "");

export const requestLogger = morgan(
    ":method :url :status :response-time ms :message",
    {
        stream: {
            write: (message: string) => logger.info(message.trim()),
        },
    }
);
