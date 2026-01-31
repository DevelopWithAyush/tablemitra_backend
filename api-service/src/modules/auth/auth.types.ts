export type { SendOtpDTO, VerifyOtpDTO } from "./validator/auth.validator.js";

export interface IUser {
    phone: string;
    isActive: boolean;
    isBlacklisted: boolean;
}

export interface IUserRole {
    userId: string;
    roleId: string;
    contextType: string;
    contextId: string;
    isActive: boolean;
}

export interface IRole {
    key: string;
    scope: string;
    level: number;
    isActive: boolean;
}

export interface IPermission {
    key: string;
    description: string;
    isActive: boolean;
}

export interface ISession {
    userId: string;
    app: string;
    refreshToken: string;
    isActive: boolean;
    expiresAt: Date;
}

export interface IAdmin {
    userId: string;
    name: string;
    email: string;
    profilePicture: string;
    isEmailVerified: boolean;
    isActive: boolean;
    isDeleted: boolean;
    isBlacklisted: boolean;
}

export interface IHotelStaff {
    userId: string;
    employeeId: string;
    role: string;
    isActive: boolean;
    isDeleted: boolean;
    isBlacklisted: boolean;
}


export interface IJwtPayload {
    sub: string;
    roleId: string;
    app: string;
    ctx: {
        type: "GLOBAL" | "CHAIN" | "HOTEL";
        id?: string;
    };
    iat?: number;
    exp?: number;
}

export interface VerifyOtpSuccessResult {
    success: true;
    accessToken: string;
    refreshToken: string;
}

export interface VerifyOtpFailureResult {
    success: false;
    message: string;
}

export type VerifyOtpResult = VerifyOtpSuccessResult | VerifyOtpFailureResult;

export interface GetMeSuccessResult {
    success: true;
    profile: Record<string, unknown>;
}

export interface GetMeFailureResult {
    success: false;
    message: string;
    unauthorized?: boolean;
}

export type GetMeResult = GetMeSuccessResult | GetMeFailureResult;