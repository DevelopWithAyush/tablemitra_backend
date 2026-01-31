import { PublishCommand } from "@aws-sdk/client-sns";
import { getSNSClient } from "../infra/aws/aws.js";
import logger from "../helpers/logger/index.js";

interface SMSResult {
    phoneNumber: string;
    status: "success" | "failed";
    messageId?: string;
    error?: string;
}

interface TemplateData {
    otp?: string;
    cafeName?: string;
    orderId?: string;
    deliveryDate?: string;
    trackingUrl?: string;
    message?: string;
}

type TemplateFunction = (data: TemplateData) => string;

const SMS_TEMPLATES: Record<string, TemplateFunction> = {
    "user-otp": (data) =>
        `Your login OTP is: ${data.otp}. Valid for 10 minutes. Do not share this code.`,

    "cafe-otp": (data) =>
        `Your ${data.cafeName} login OTP is: ${data.otp}. Valid for 10 minutes. Do not share this code.`,

    "cafe-settings-otp": (data) =>
        `Your ${data.cafeName} settings OTP is: ${data.otp}. Valid for 10 minutes. Do not share this code.`,

    "order-confirmation": (data) =>
        `Order #${data.orderId} confirmed! Estimated delivery: ${data.deliveryDate}. Track: ${data.trackingUrl}`,

    "generic-notification": (data) => data.message || "",
};

const formatIndianPhoneNumber = (phoneNumber: string): string => {
    let cleaned = phoneNumber
        .replace(/[-\s]/g, "")
        .replace(/^0+/, "");

    if (cleaned.startsWith("+91")) {
        return cleaned;
    } else if (cleaned.startsWith("91") && cleaned.length > 10) {
        return "+" + cleaned;
    } else if (!cleaned.startsWith("+")) {
        return "+91" + cleaned;
    }

    return cleaned;
};

export const sendSMS = async (phoneNumber: string, message: string): Promise<string> => {
    const snsClient = getSNSClient();
    const formattedPhoneNumber = formatIndianPhoneNumber(phoneNumber);

    const params = {
        PhoneNumber: formattedPhoneNumber,
        Message: message,
        MessageAttributes: {
            "AWS.SNS.SMS.SMSType": {
                DataType: "String",
                StringValue: "Transactional",
            },
        },
    };

    try {
        const command = new PublishCommand(params);
        const result = await snsClient.send(command);

        logger.info(`SMS sent successfully - MessageId: ${result.MessageId}`);
        return result.MessageId || "";
    } catch (error: unknown) {
        const err = error as Error & { name?: string; Code?: string };
        logger.error("SNS SMS Error:", err);

        if (err.name === "InvalidClientTokenId" || err.Code === "InvalidClientTokenId") {
            throw new Error("SMS service credentials are invalid. Please contact administrator.");
        }

        throw new Error("SMS sending failed: " + err.message);
    }
};

export const sendOTP = async (phoneNumber: string, otp: string, app?: string, hotelName?: string): Promise<string> => {
    const message = `Your ${app ? `for ${app}` : ''} ${hotelName ? `for ${hotelName}` : ''} verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;

    logger.info(`Sending OTP to ${phoneNumber}`);

    try {
        const messageId = await sendSMS(phoneNumber, message);
        logger.info(`OTP sent successfully to ${phoneNumber}`);
        return messageId;
    } catch (error) {
        logger.error(`Failed to send OTP SMS to ${phoneNumber}:`, error);
        throw new Error("Unable to send OTP. Please try again");
    }
};

export const sendTemplateSMS = async (
    phoneNumber: string,
    templateName: string,
    data: TemplateData = {}
): Promise<string> => {
    const messageTemplate = SMS_TEMPLATES[templateName];

    if (!messageTemplate) {
        throw new Error(`Template '${templateName}' not found`);
    }

    const message = messageTemplate(data);

    try {
        const messageId = await sendSMS(phoneNumber, message);
        logger.info(`Template SMS '${templateName}' sent to ${phoneNumber}`);
        return messageId;
    } catch (error) {
        logger.error(`Failed to send template SMS '${templateName}':`, error);
        throw new Error(`Unable to send ${templateName} SMS`);
    }
};

export const sendBulkSMS = async (
    phoneNumbers: string[],
    message: string
): Promise<SMSResult[]> => {
    logger.info(`Sending bulk SMS to ${phoneNumbers.length} recipients`);

    const results = await Promise.allSettled(
        phoneNumbers.map((phoneNumber) =>
            sendSMS(phoneNumber, message)
                .then((messageId) => ({
                    phoneNumber,
                    status: "success" as const,
                    messageId,
                }))
                .catch((error: Error) => ({
                    phoneNumber,
                    status: "failed" as const,
                    error: error.message,
                }))
        )
    );

    const successCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === "success"
    ).length;
    const failureCount = results.length - successCount;

    logger.info(`Bulk SMS completed: ${successCount} succeeded, ${failureCount} failed`);

    return results.map((r) => (r as PromiseFulfilledResult<SMSResult>).value);
};
