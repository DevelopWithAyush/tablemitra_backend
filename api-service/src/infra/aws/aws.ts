import { S3Client } from "@aws-sdk/client-s3";
import { SNSClient } from "@aws-sdk/client-sns";
import logger from "../../helpers/logger/index.js";

interface AWSConfig {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3Bucket: string;
}

let s3Client: S3Client | null = null;
let snsClient: SNSClient | null = null;
let awsConfig: AWSConfig | null = null;

const validateAWSConfig = (): AWSConfig => {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const s3Bucket = process.env.AWS_S3_BUCKET || "10medz";

    if (!region || !accessKeyId || !secretAccessKey) {
        const missing = [
            !region && "AWS_REGION",
            !accessKeyId && "AWS_ACCESS_KEY_ID",
            !secretAccessKey && "AWS_SECRET_ACCESS_KEY",
        ].filter(Boolean);
        logger.error(`Missing AWS configuration: ${missing.join(", ")}`);
        throw new Error(`Missing AWS configuration: ${missing.join(", ")}`);
    }

    if (accessKeyId.length < 16 || secretAccessKey.length < 30) {
        logger.error("AWS credentials appear to be invalid (incorrect length)");
        throw new Error("AWS credentials appear to be invalid (incorrect length)");
    }

    return { region, accessKeyId, secretAccessKey, s3Bucket };
};

export const initAWS = (): void => {
    if (s3Client && snsClient) return;

    awsConfig = validateAWSConfig();

    const credentials = {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
    };

    s3Client = new S3Client({
        region: awsConfig.region,
        credentials,
    });

    snsClient = new SNSClient({
        region: awsConfig.region,
        credentials,
    });

    logger.info("AWS clients initialized successfully");
};

export const getS3Client = (): S3Client => {
    if (!s3Client) {
        logger.error("AWS not initialized. Call initAWS() first.");
        throw new Error("AWS not initialized. Call initAWS() first.");
    }
    return s3Client;
};

export const getSNSClient = (): SNSClient => {
    if (!snsClient) {
        logger.error("AWS not initialized. Call initAWS() first.");
        throw new Error("AWS not initialized. Call initAWS() first.");
    }
    return snsClient;
};

export const getS3Bucket = (): string => {
    if (!awsConfig) {
        logger.error("AWS not initialized. Call initAWS() first.");
        throw new Error("AWS not initialized. Call initAWS() first.");
    }
    return awsConfig.s3Bucket;
};
