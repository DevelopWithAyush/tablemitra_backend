import attachmentService from "./attach.service.js";
import logger from "../../helpers/logger/index.js";

// Cleanup interval: Run every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the cleanup job for expired pending attachments
 */
export const startAttachmentCleanupJob = (): void => {
    if (cleanupInterval) {
        logger.warn("Attachment cleanup job is already running");
        return;
    }

    logger.info("Starting attachment cleanup job...");

    // Run immediately on start
    runCleanup();

    // Then run every 5 minutes
    cleanupInterval = setInterval(() => {
        runCleanup();
    }, CLEANUP_INTERVAL_MS);

    logger.info(
        `Attachment cleanup job started. Will run every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes.`
    );
};

/**
 * Stop the cleanup job
 */
export const stopAttachmentCleanupJob = (): void => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        logger.info("Attachment cleanup job stopped");
    }
};

/**
 * Run the cleanup process
 */
const runCleanup = async (): Promise<void> => {
    try {
        const deletedCount = await attachmentService.cleanupExpiredPendingAttachments();
        if (deletedCount > 0) {
            logger.info(`Cleanup job: Deleted ${deletedCount} expired pending attachment(s)`);
        }
    } catch (error) {
        logger.error("Error in attachment cleanup job:", error);
    }
};
