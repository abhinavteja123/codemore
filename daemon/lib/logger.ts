/**
 * Pino Logger for CodeMore Daemon
 *
 * Provides structured logging with:
 * - Automatic secret redaction
 * - Pretty printing in development
 * - JSON output in production
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Paths to automatically redact (secrets, tokens, etc.)
const redactPaths = [
    '*.accessToken',
    '*.apiKey',
    '*.secret',
    '*.password',
    '*.token',
    '*.authorization',
    'accessToken',
    'apiKey',
    'secret',
    'password',
    'token',
    'authorization',
];

// Create base logger
const logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    redact: {
        paths: redactPaths,
        censor: '[REDACTED]',
    },
    base: {
        service: 'codemore-daemon',
        pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Use pino-pretty in development for readable output
    transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});

/**
 * Create a child logger for a specific module
 */
export function createLogger(module: string): pino.Logger {
    return logger.child({ module });
}

/**
 * Safely extract error info without leaking sensitive data
 */
export function sanitizeError(error: unknown): { message: string; name: string; code?: string } {
    if (error instanceof Error) {
        const sanitized: { message: string; name: string; code?: string } = {
            message: error.message,
            name: error.name,
        };

        // Include error code if present (common in Node.js errors)
        if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
            sanitized.code = (error as { code: string }).code;
        }

        // In production, don't include stack traces
        return sanitized;
    }

    if (typeof error === 'string') {
        return { message: error, name: 'Error' };
    }

    return { message: 'Unknown error', name: 'Error' };
}

export default logger;
