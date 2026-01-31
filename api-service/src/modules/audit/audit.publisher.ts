import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import logger from "../../helpers/logger/index.js";
import {
    AuditAction,
    AuditEventActor,
    AuditEventContext,
    AuditEventPayload,
    AUDIT_EXCHANGE,
    AUDIT_QUEUE,
    EntityType,
} from "./audit.types.js";

let isQueueSetup = false;

const setupQueue = async (): Promise<void> => {
    if (isQueueSetup) return;

    const channel = getRabbitChannel();

    await channel.assertExchange(AUDIT_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(AUDIT_QUEUE, {
        durable: true,
        arguments: {
            "x-message-ttl": 1000 * 60 * 60 * 24 * 7, // 7 days TTL for unprocessed messages
        },
    });
    await channel.bindQueue(AUDIT_QUEUE, AUDIT_EXCHANGE, "audit");

    isQueueSetup = true;
    logger.info("Audit queue setup complete");
};

export const publishAuditEvent = async (
    action: AuditAction,
    entityType: EntityType,
    entityId: string,
    actor: AuditEventActor,
    options?: {
        context?: AuditEventContext;
        previousData?: Record<string, unknown>;
        newData?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
    }
): Promise<void> => {
    try {
        await setupQueue();

        const channel = getRabbitChannel();

        const payload: AuditEventPayload = {
            action,
            entityType,
            entityId,
            actor,
            context: options?.context,
            previousData: options?.previousData,
            newData: options?.newData,
            metadata: options?.metadata,
            timestamp: new Date(),
        };

        channel.publish(
            AUDIT_EXCHANGE,
            "audit",
            Buffer.from(JSON.stringify(payload)),
            {
                persistent: true,
                contentType: "application/json",
            }
        );

        logger.debug(`Audit event published: ${action} on ${entityType}:${entityId}`);
    } catch (error) {
        logger.error("Failed to publish audit event:", error);
    }
};

export const createAuditHelper = (
    defaultContext: Partial<AuditEventContext>
) => {
    return {
        log: (
            action: AuditAction,
            entityType: EntityType,
            entityId: string,
            actor: AuditEventActor,
            options?: {
                previousData?: Record<string, unknown>;
                newData?: Record<string, unknown>;
                metadata?: Record<string, unknown>;
            }
        ) =>
            publishAuditEvent(action, entityType, entityId, actor, {
                ...options,
                context: { ...defaultContext, ...options },
            }),
    };
};
