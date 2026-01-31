
import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import { AUDIT_EXCHANGE, AUDIT_QUEUE, AuditEventPayload, RETENTION_DAYS } from "./audit.types.js";
import { AuditLog } from "./db/audit-log.model.js";


export const startAuditConsumer = async (): Promise<void> => {
    const channel = getRabbitChannel();

    await channel.assertExchange(AUDIT_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(AUDIT_QUEUE, {
        durable: true,
        arguments: {
            "x-message-ttl": 1000 * 60 * 60 * 24 * 7,
        },
    });
    await channel.bindQueue(AUDIT_QUEUE, AUDIT_EXCHANGE, "audit");

    console.log(`[Audit Service] Consuming from queue: ${AUDIT_QUEUE}`);

    channel.consume(
        AUDIT_QUEUE,
        async (msg) => {
            if (!msg) return;

            try {
                const payload: AuditEventPayload = JSON.parse(
                    msg.content.toString()
                );

                const expiresAt = new Date(
                    Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000
                );

                await AuditLog.create({
                    action: payload.action,
                    entityType: payload.entityType,
                    entityId: payload.entityId,
                    actor: payload.actor,
                    context: payload.context,
                    previousData: payload.previousData,
                    newData: payload.newData,
                    metadata: payload.metadata,
                    timestamp: new Date(payload.timestamp),
                    expiresAt,
                });

                channel.ack(msg);

                console.log(
                    `[Audit Service] Logged: ${payload.action} on ${payload.entityType}:${payload.entityId}`
                );
            } catch (error) {
                console.error(
                    "[Audit Service] Failed to process audit event:",
                    error
                );
                channel.nack(msg, false, false);
            }
        },
        { noAck: false }
    );
};
