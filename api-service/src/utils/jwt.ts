import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { IJwtPayload } from "../modules/auth/auth.types.js";
dotenv.config();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET as string;

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "30d";

export const REFRESH_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

export const generateAccessToken = (payload: Omit<IJwtPayload, "iat" | "exp">): string => {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = (payload: Omit<IJwtPayload, "iat" | "exp">): string => {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
};

export const verifyAccessToken = (token: string): IJwtPayload => {
    return jwt.verify(token, ACCESS_TOKEN_SECRET) as IJwtPayload;
};

export const verifyRefreshToken = (token: string): IJwtPayload => {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as IJwtPayload;
};
