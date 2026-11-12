export const AWS_CLI_CANDIDATES = ['/opt/homebrew/bin/aws', '/usr/local/bin/aws', '/usr/bin/aws'];

/** Configured path (trimmed) if set; else the first existing candidate; else undefined. */
export function resolveAwsCliPath(configured: string, exists: (p: string) => boolean): string | undefined {
    const trimmed = configured.trim();
    if (trimmed) return trimmed;
    return AWS_CLI_CANDIDATES.find((p) => exists(p));
}
