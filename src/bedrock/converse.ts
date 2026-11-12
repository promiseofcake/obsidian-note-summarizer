import { requestUrl } from 'obsidian';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { AwsAuthError, getAwsCliCredentials, invalidateAwsCliCredentials } from './credentials';

export interface BedrockConnection {
    awsCliPath: string;
    awsProfile: string;
    region: string;
    /** Model ID or inference profile ID/ARN */
    modelId: string;
    /** Per-request timeout in ms (default DEFAULT_REQUEST_TIMEOUT_MS) */
    timeoutMs?: number;
}

/** Long enough for a full max-tokens summary from a large note. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

export interface BedrockTextParams extends BedrockConnection {
    system?: string;
    prompt: string;
    maxTokens: number;
}

export interface BedrockTextResult {
    text: string;
    stopReason: string;
    usage: TokenUsage;
}

/** The request got no response within timeoutMs. Not retried by withBedrockRetry. */
export class BedrockTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BedrockTimeoutError';
    }
}

/**
 * requestUrl has no timeout or abort, so race it against a timer. A request that loses
 * the race keeps running in the background; its result is ignored.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(
            () => reject(new BedrockTimeoutError(`Bedrock request timed out after ${Math.round(ms / 1000)}s`)),
            ms
        );
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/** The model hit maxTokens (stopReason === 'max_tokens'); output was cut off. Message carries metadata only. */
export class BedrockTruncatedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BedrockTruncatedError';
    }
}

interface ConverseResponse {
    output?: {
        message?: {
            content?: Array<{ text?: string }>;
        };
    };
    stopReason?: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

interface RawConverse {
    response: ConverseResponse;
    text: string;
    requestId: string;
}

// Bedrock's answer when the signing credentials are expired, revoked or malformed (not missing model access)
const REJECTED_CREDENTIALS = /ExpiredToken|UnrecognizedClient|InvalidSignature|security token included in the request is (expired|invalid)/i;

function parseErrorBody(status: number, body: string, json: unknown): string {
    const err = json as { message?: string; Message?: string } | undefined;
    const msg = err?.message ?? err?.Message ?? body?.slice(0, 500) ?? 'Unknown error';
    return `${status} ${msg}`.trim();
}

function usageOf(response: ConverseResponse): TokenUsage {
    return {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0
    };
}

/** Response metadata only (never prompt or output content), safe to persist and share */
function diagnostics(raw: RawConverse, maxTokens: number): string {
    const { response, text, requestId } = raw;
    return `[stopReason: ${response.stopReason ?? 'unknown'}, outputChars: ${text.length}, ` +
        `outputTokens: ${response.usage?.outputTokens ?? '?'}/${maxTokens}, requestId: ${requestId}]`;
}

/** Sign and send one Converse body; retries once with fresh credentials if the cached ones were rejected. */
async function converseRaw(conn: BedrockConnection, body: string): Promise<RawConverse> {
    try {
        return await converseOnce(conn, body);
    } catch (error) {
        if (!(error instanceof AwsAuthError) || error.reason !== 'rejected') throw error;
        // Cached credentials went stale; ask the CLI again once. If SSO itself expired, that call says so.
        invalidateAwsCliCredentials(conn.awsCliPath, conn.awsProfile);
        return converseOnce(conn, body);
    }
}

async function converseOnce(conn: BedrockConnection, body: string): Promise<RawConverse> {
    const credentials = await getAwsCliCredentials(conn.awsCliPath, conn.awsProfile);

    const hostname = `bedrock-runtime.${conn.region}.amazonaws.com`;
    const path = `/model/${encodeURIComponent(conn.modelId)}/converse`;

    const signer = new SignatureV4({
        service: 'bedrock',
        region: conn.region,
        credentials,
        sha256: Sha256
    });
    const signed = await signer.sign({
        method: 'POST',
        protocol: 'https:',
        hostname,
        path,
        headers: { host: hostname, 'content-type': 'application/json' },
        body
    });

    // host is signed but set by the transport itself
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(signed.headers)) {
        if (name.toLowerCase() !== 'host') headers[name] = value;
    }

    const result = await withTimeout(requestUrl({
        url: `https://${hostname}${path}`,
        method: 'POST',
        headers,
        body,
        throw: false
    }), conn.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

    let json: unknown;
    try {
        json = result.json;
    } catch {
        json = undefined;
    }

    const requestId = result.headers?.['x-amzn-requestid'] ?? result.headers?.['X-Amzn-RequestId'] ?? 'unknown';

    if (result.status < 200 || result.status >= 300) {
        const message = `${parseErrorBody(result.status, result.text, json)} [requestId: ${requestId}]`;
        const errorType = result.headers?.['x-amzn-errortype'] ?? result.headers?.['X-Amzn-ErrorType'] ?? '';
        if ((result.status === 400 || result.status === 403) && REJECTED_CREDENTIALS.test(`${errorType} ${message}`)) {
            throw new AwsAuthError(message, 'rejected', conn.awsProfile, conn.awsCliPath);
        }
        throw new Error(message);
    }

    const response = (json ?? {}) as ConverseResponse;
    const text = (response.output?.message?.content ?? [])
        .map(c => c.text ?? '')
        .join('')
        .trim();
    return { response, text, requestId };
}

/** Plain-text Bedrock Converse call (optional system prompt). */
export async function bedrockConverseText(params: BedrockTextParams): Promise<BedrockTextResult> {
    const body = JSON.stringify({
        messages: [{ role: 'user', content: [{ text: params.prompt }] }],
        ...(params.system ? { system: [{ text: params.system }] } : {}),
        // No temperature/topP: newer Claude models reject them
        inferenceConfig: { maxTokens: params.maxTokens }
    });

    const raw = await converseRaw(params, body);
    const diag = diagnostics(raw, params.maxTokens);

    if (raw.response.stopReason === 'max_tokens') {
        throw new BedrockTruncatedError(`Bedrock response truncated at the output token limit ${diag}`);
    }
    if (!raw.text) {
        throw new Error(`Empty response from Bedrock ${diag}`);
    }

    return { text: raw.text, stopReason: raw.response.stopReason ?? 'unknown', usage: usageOf(raw.response) };
}
