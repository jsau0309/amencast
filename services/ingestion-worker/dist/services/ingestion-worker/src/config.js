"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env file from the root of ingestion-worker
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
/**
 * Retrieves the value of a required environment variable.
 *
 * Throws an error if the environment variable specified by {@link key} is missing or empty. If {@link isSensitive} is true, the error message indicates the variable is sensitive.
 *
 * @param key - The name of the environment variable to retrieve.
 * @param isSensitive - Whether the variable is sensitive; affects the error message if missing.
 * @returns The value of the environment variable.
 *
 * @throws {Error} If the environment variable is missing or empty.
 */
function getEnvVar(key, isSensitive = false) {
    const value = process.env[key];
    if (value === undefined || value === null || value === '') {
        if (isSensitive)
            throw new Error(`Missing a required sensitive environment variable (key: ${key}).`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
exports.config = {
    redis: {
        host: getEnvVar('REDIS_HOST'),
        port: parseInt(getEnvVar('REDIS_PORT'), 10),
        password: process.env.REDIS_PASSWORD || undefined, // Password is optional
        tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
        inputQueueName: getEnvVar('INPUT_REDIS_QUEUE_NAME'),
        outputQueueName: getEnvVar('OUTPUT_REDIS_QUEUE_NAME'),
    },
    supabase: {
        url: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
        serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY', true),
        audioBucket: getEnvVar('SUPABASE_AUDIO_BUCKET'),
    },
    language: {
        defaultTarget: process.env.DEFAULT_LANGUAGE_TARGET || 'es',
    },
    youtube: {
        audioQuality: process.env.YTDL_AUDIO_QUALITY || 'highestaudio',
    },
    worker: {
        pollingIntervalMs: parseInt(process.env.INGESTION_WORKER_POLLING_INTERVAL_MS || '5000', 10),
        concurrentJobs: 1, // Start with 1 for simplicity, can be made configurable
    }
};
// Basic validation
if (exports.config.redis.port < 1024 || exports.config.redis.port > 65535) {
    console.warn(`REDIS_PORT "${exports.config.redis.port}" might be incorrect. Should be within the valid port range.`);
}
if (exports.config.worker.pollingIntervalMs < 1000) {
    console.warn('INGESTION_WORKER_POLLING_INTERVAL_MS is very low.');
}
