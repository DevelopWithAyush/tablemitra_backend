import { z } from "zod";

export const SendOtpSchema = z.object({
    body: z.object({
        phone: z.string().regex(/^\+?[1-9]\d{1,14}$/)
    }),
});

export const VerifyOtpSchema = z.object({
    body: z.object({
        phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
        code: z.string().length(4),
        scanToken: z.string().min(1).optional(),
    }),
});

export const SwitchChainSchema = z.object({
    body: z.object({
        chainId: z.string().length(24, "Invalid chain ID"),
    }),
});

// DTO types with app param
export interface SendOtpDTO {
    body: { phone: string };
    app: string;
}

export interface VerifyOtpDTO {
    body: { phone: string; code: string; scanToken?: string };
    params: { app: string };
}

export interface SwitchChainDTO {
    body: { chainId: string };
    params: { app: string };
}
