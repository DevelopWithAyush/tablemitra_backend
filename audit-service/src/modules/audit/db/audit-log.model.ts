import mongoose, { Schema, Document } from "mongoose";
import { ActorRole, AuditAction, EntityType, RETENTION_DAYS } from "../audit.types";


export interface IAuditLog extends Document {
    action: AuditAction;
    entityType: EntityType;
    entityId: string;
    actor: {
        userId: string;
        role: ActorRole;
        name?: string;
        email?: string;
    };
    context?: {
        hotelId?: string;
        chainId?: string;
        sessionId?: string;
        ip?: string;
        userAgent?: string;
        panel?: string;
    };
    previousData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    timestamp: Date;
    expiresAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
    {
        action: {
            type: String,
            required: true,
        },
        entityType: {
            type: String,
            required: true,
        },
        entityId: {
            type: String,
            required: true,
        },
        actor: {
            userId: { type: String, required: true },
            role: { type: String, required: true },
            name: String,
            email: String,
        },
        context: {
            hotelId: String,
            chainId: String,
            sessionId: String,
            ip: String,
            userAgent: String,
            panel: String,
        },
        previousData: {
            type: Schema.Types.Mixed,
        },
        newData: {
            type: Schema.Types.Mixed,
        },
        metadata: {
            type: Schema.Types.Mixed,
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            required: true,
            default: () =>
                new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
    },
    {
        timestamps: false,
        versionKey: false,
    }
);

// Compound indexes for common query patterns
auditLogSchema.index({ "context.hotelId": 1, timestamp: -1 });
auditLogSchema.index({ "context.chainId": 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ "actor.userId": 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

// TTL index for automatic document expiration (3 years)
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text index for search
auditLogSchema.index({
    action: "text",
    entityType: "text",
    "actor.name": "text",
});

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
