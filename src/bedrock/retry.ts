import { AwsAuthError } from './credentials';

export interface RetryOptions {
    /** Total attempts including the first (default 5) */
    maxAttempts?: number;
    /** Backoff base in ms (default 2000) */
    baseMs?: number;
    /** Backoff cap in ms (default 30000) */
    maxMs?: number;
    /** Injectable for tests; defaults to a window.setTimeout delay */
    sleep?: (ms: number) => Promise<void>;
    /** Replaces the default classifier, e.g. to exclude provider-specific quota errors */
    isRetryable?: (message: string) => boolean;
}

/** Throttling and transient server errors are worth retrying; client errors are not. */
export function isRetryableBedrockError(message: string): boolean {
    const status = Number(/^(\d{3}) /.exec(message)?.[1]);
    return [429, 500, 502, 503, 504].includes(status)
        || /ThrottlingException|ServiceUnavailable|ModelNotReady|too many requests/i.test(message);
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => { window.setTimeout(resolve, ms); });

/** Run `call`, retrying retryable failures with full-jitter exponential backoff. Never retries AwsAuthError. */
export async function withBedrockRetry<T>(call: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
        maxAttempts = 5,
        baseMs = 2000,
        maxMs = 30000,
        sleep = defaultSleep,
        isRetryable = isRetryableBedrockError
    } = options;
    for (let attempt = 1; ; attempt++) {
        try {
            return await call();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof AwsAuthError || attempt >= maxAttempts || !isRetryable(message)) {
                throw error;
            }
            const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
            await sleep(Math.random() * cap);
        }
    }
}
