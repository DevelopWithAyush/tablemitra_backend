import { CookieOptions } from "express";
import logger from "../helpers/logger/index.js";

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;

const APP_SUBDOMAIN_MAP: Record<string, string> = {
    "customer": "order",
    "admin": "admin",
    "founder": "founder",
    "customer-care": "customer-care",
    "manager": "manager",
    "frontdesk": "frontdesk",
    "kitchen": "kitchen",
    "room-service": "room-service",
};

const getCookieDomain = (app: string): string | undefined => {
    if (!isProduction || !COOKIE_DOMAIN) {
        return undefined;
    }

    const subdomain = APP_SUBDOMAIN_MAP[app];
    if (!subdomain) {
        return undefined;
    }

    return `${subdomain}.${COOKIE_DOMAIN}`;
};

export const buildCookieOptions = (app: string, maxAge: number): CookieOptions => {
    const domain = getCookieDomain(app);
    logger.info(`Building cookie options for app: ${app}, domain: ${domain}`);

    const options: CookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: "none",
        maxAge,
        path: "/",
    };

    if (domain) {
        options.domain = domain;
    }

    return options;
};
