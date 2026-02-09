/**
 * Backup automation utilities for Axel.
 *
 * Provides pg_dump command generation, cron entry generation,
 * retention policy engine, and storage usage calculation.
 * All functions are pure with no actual I/O.
 *
 * @module ops/backup
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for backup configuration.
 *
 * Validates cron schedule, retention policy, destination type,
 * paths/buckets, compression setting, and database connection URL.
 */
export const BackupConfigSchema = z.object({
	/** Cron schedule string (e.g. "0 2 * * *") */
	schedule: z.string().min(1),

	/** Number of days to retain backup files. Must be positive. */
	retentionDays: z.number().int().positive().default(30),

	/** Backup destination: local filesystem or S3 */
	destination: z.enum(['local', 's3']),

	/** Local filesystem path for backup output */
	localPath: z.string().min(1),

	/** S3 bucket name (required when destination is 's3') */
	s3Bucket: z.string().optional(),

	/** S3 key prefix (required when destination is 's3') */
	s3Prefix: z.string().optional(),

	/** Whether to enable pg_dump compression */
	compressionEnabled: z.boolean().default(true),

	/** PostgreSQL connection URL */
	databaseUrl: z.string().min(1),
});

/** Inferred TypeScript type from BackupConfigSchema */
export type BackupConfig = z.infer<typeof BackupConfigSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a backup file on disk for retention policy evaluation. */
export interface BackupFile {
	readonly path: string;
	readonly createdAt: Date;
	readonly sizeBytes: number;
}

/** Result of generating a pg_dump command. */
export interface PgDumpCommandResult {
	readonly command: string;
	readonly outputPath: string;
}

/** Result of applying a retention policy to a set of backup files. */
export interface RetentionResult {
	readonly keep: readonly BackupFile[];
	readonly remove: readonly BackupFile[];
}

/** Aggregate storage usage statistics for backup files. */
export interface StorageUsage {
	readonly totalBytes: number;
	readonly fileCount: number;
	readonly oldestFile: Date | undefined;
	readonly newestFile: Date | undefined;
}

// ---------------------------------------------------------------------------
// pg_dump command generation
// ---------------------------------------------------------------------------

/**
 * Format a Date as a timestamp string suitable for filenames.
 * Format: YYYYMMDD_HHmmss
 */
function formatTimestamp(date: Date): string {
	const y = date.getFullYear().toString();
	const mo = (date.getMonth() + 1).toString().padStart(2, '0');
	const d = date.getDate().toString().padStart(2, '0');
	const h = date.getHours().toString().padStart(2, '0');
	const mi = date.getMinutes().toString().padStart(2, '0');
	const s = date.getSeconds().toString().padStart(2, '0');
	return `${y}${mo}${d}_${h}${mi}${s}`;
}

/**
 * Generate a pg_dump command string with proper flags.
 *
 * Produces a command using --format=custom, optional --compress,
 * and a timestamped output filename under the configured localPath.
 *
 * @param config - Validated backup configuration
 * @returns Object containing the full command string and output file path
 */
export function generatePgDumpCommand(config: BackupConfig): PgDumpCommandResult {
	const timestamp = formatTimestamp(new Date());
	const fileName = `axel_backup_${timestamp}.dump`;
	const outputPath = `${config.localPath}/${fileName}`;

	const parts: string[] = ['pg_dump'];
	parts.push('--format=custom');

	if (config.compressionEnabled) {
		parts.push('--compress=9');
	}

	parts.push(`--file=${outputPath}`);
	parts.push(config.databaseUrl);

	return {
		command: parts.join(' '),
		outputPath,
	};
}

// ---------------------------------------------------------------------------
// Retention policy engine
// ---------------------------------------------------------------------------

/**
 * Apply a retention policy to a list of backup files.
 *
 * Files older than `retentionDays` (measured from `now`) are placed
 * in the `remove` list. Files within the retention window are placed
 * in the `keep` list, sorted by createdAt descending (newest first).
 *
 * @param files - List of backup files to evaluate
 * @param retentionDays - Number of days to retain files
 * @param now - Reference date for age calculation (defaults to current time)
 * @returns Object with `keep` and `remove` arrays
 */
export function applyRetentionPolicy(
	files: readonly BackupFile[],
	retentionDays: number,
	now?: Date,
): RetentionResult {
	const referenceDate = now ?? new Date();
	const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
	const cutoffDate = new Date(referenceDate.getTime() - cutoffMs);

	const keep: BackupFile[] = [];
	const remove: BackupFile[] = [];

	for (const file of files) {
		if (file.createdAt >= cutoffDate) {
			keep.push(file);
		} else {
			remove.push(file);
		}
	}

	// Sort keep list by createdAt descending (newest first)
	keep.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	return { keep, remove };
}

/**
 * Calculate aggregate storage usage statistics for a set of backup files.
 *
 * @param files - List of backup files
 * @returns Storage usage summary including total bytes, count, oldest/newest dates
 */
export function calculateStorageUsage(files: readonly BackupFile[]): StorageUsage {
	if (files.length === 0) {
		return {
			totalBytes: 0,
			fileCount: 0,
			oldestFile: undefined,
			newestFile: undefined,
		};
	}

	let totalBytes = 0;
	let oldestTime = Infinity;
	let newestTime = -Infinity;

	for (const file of files) {
		totalBytes += file.sizeBytes;
		const time = file.createdAt.getTime();
		if (time < oldestTime) {
			oldestTime = time;
		}
		if (time > newestTime) {
			newestTime = time;
		}
	}

	return {
		totalBytes,
		fileCount: files.length,
		oldestFile: new Date(oldestTime),
		newestFile: new Date(newestTime),
	};
}

// ---------------------------------------------------------------------------
// Cron entry generation
// ---------------------------------------------------------------------------

/**
 * Generate a crontab entry line for scheduled pg_dump execution.
 *
 * Produces a single-line cron entry using the schedule from config
 * and a pg_dump command with the appropriate flags.
 *
 * @param config - Validated backup configuration
 * @returns A single crontab-format line (no trailing newline)
 */
export function generateCronEntry(config: BackupConfig): string {
	const { command } = generatePgDumpCommand(config);
	return `${config.schedule} ${command}`;
}
