import { describe, expect, it } from 'vitest';
import {
	type BackupConfig,
	BackupConfigSchema,
	type BackupFile,
	applyRetentionPolicy,
	calculateStorageUsage,
	generateCronEntry,
	generatePgDumpCommand,
} from '../../src/ops/backup.js';

describe('BackupConfigSchema', () => {
	const validConfig = {
		schedule: '0 2 * * *',
		retentionDays: 30,
		destination: 'local' as const,
		localPath: '/var/backups/axel',
		compressionEnabled: true,
		databaseUrl: 'postgresql://user:pass@localhost:5432/axel',
	};

	it('accepts a valid local config with all fields', () => {
		const result = BackupConfigSchema.safeParse(validConfig);
		expect(result.success).toBe(true);
	});

	it('applies default retentionDays of 30', () => {
		const { retentionDays, ...withoutRetention } = validConfig;
		const result = BackupConfigSchema.parse(withoutRetention);
		expect(result.retentionDays).toBe(30);
	});

	it('applies default compressionEnabled of true', () => {
		const { compressionEnabled, ...withoutCompression } = validConfig;
		const result = BackupConfigSchema.parse(withoutCompression);
		expect(result.compressionEnabled).toBe(true);
	});

	it('accepts a valid S3 config', () => {
		const s3Config = {
			schedule: '0 3 * * *',
			destination: 's3' as const,
			localPath: '/tmp/backups',
			s3Bucket: 'axel-backups',
			s3Prefix: 'daily/',
			databaseUrl: 'postgresql://user:pass@localhost:5432/axel',
		};
		const result = BackupConfigSchema.safeParse(s3Config);
		expect(result.success).toBe(true);
	});

	it('rejects missing schedule', () => {
		const { schedule, ...noSchedule } = validConfig;
		const result = BackupConfigSchema.safeParse(noSchedule);
		expect(result.success).toBe(false);
	});

	it('rejects missing destination', () => {
		const { destination, ...noDestination } = validConfig;
		const result = BackupConfigSchema.safeParse(noDestination);
		expect(result.success).toBe(false);
	});

	it('rejects invalid destination value', () => {
		const result = BackupConfigSchema.safeParse({
			...validConfig,
			destination: 'azure',
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing localPath', () => {
		const { localPath, ...noLocalPath } = validConfig;
		const result = BackupConfigSchema.safeParse(noLocalPath);
		expect(result.success).toBe(false);
	});

	it('rejects missing databaseUrl', () => {
		const { databaseUrl, ...noDatabaseUrl } = validConfig;
		const result = BackupConfigSchema.safeParse(noDatabaseUrl);
		expect(result.success).toBe(false);
	});

	it('rejects non-positive retentionDays', () => {
		const result = BackupConfigSchema.safeParse({
			...validConfig,
			retentionDays: 0,
		});
		expect(result.success).toBe(false);
	});

	it('rejects negative retentionDays', () => {
		const result = BackupConfigSchema.safeParse({
			...validConfig,
			retentionDays: -5,
		});
		expect(result.success).toBe(false);
	});
});

describe('generatePgDumpCommand', () => {
	const baseConfig: BackupConfig = {
		schedule: '0 2 * * *',
		retentionDays: 30,
		destination: 'local',
		localPath: '/var/backups/axel',
		compressionEnabled: true,
		databaseUrl: 'postgresql://user:pass@localhost:5432/axel',
	};

	it('returns an object with command and outputPath', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result).toHaveProperty('command');
		expect(result).toHaveProperty('outputPath');
		expect(typeof result.command).toBe('string');
		expect(typeof result.outputPath).toBe('string');
	});

	it('includes --format=custom flag', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result.command).toContain('--format=custom');
	});

	it('includes --compress when compressionEnabled is true', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result.command).toContain('--compress=');
	});

	it('omits --compress when compressionEnabled is false', () => {
		const config: BackupConfig = { ...baseConfig, compressionEnabled: false };
		const result = generatePgDumpCommand(config);
		expect(result.command).not.toContain('--compress');
	});

	it('includes pg_dump as the command', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result.command).toMatch(/^pg_dump\s/);
	});

	it('includes the database URL', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result.command).toContain(baseConfig.databaseUrl);
	});

	it('generates a timestamped filename in outputPath', () => {
		const result = generatePgDumpCommand(baseConfig);
		// Expect pattern like: /var/backups/axel/axel_backup_YYYYMMDD_HHmmss.dump
		expect(result.outputPath).toMatch(/\/var\/backups\/axel\/axel_backup_\d{8}_\d{6}\.dump$/);
	});

	it('uses --file flag pointing to outputPath', () => {
		const result = generatePgDumpCommand(baseConfig);
		expect(result.command).toContain(`--file=${result.outputPath}`);
	});

	it('generates consistent outputPath between command and return', () => {
		const result = generatePgDumpCommand(baseConfig);
		// The --file= value in the command must match the returned outputPath
		const fileMatch = result.command.match(/--file=(\S+)/);
		expect(fileMatch).not.toBeNull();
		expect(fileMatch![1]).toBe(result.outputPath);
	});

	it('uses the localPath from config in the output path', () => {
		const config: BackupConfig = {
			...baseConfig,
			localPath: '/custom/backup/dir',
		};
		const result = generatePgDumpCommand(config);
		expect(result.outputPath).toMatch(/^\/custom\/backup\/dir\//);
	});
});

describe('applyRetentionPolicy', () => {
	const now = new Date('2025-06-15T12:00:00Z');

	function makeFile(daysAgo: number, path?: string): BackupFile {
		const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
		return {
			path: path ?? `/backups/axel_backup_${daysAgo}d.dump`,
			createdAt,
			sizeBytes: 1024 * 1024,
		};
	}

	it('keeps files within retention period', () => {
		const files: readonly BackupFile[] = [makeFile(5), makeFile(10), makeFile(20)];
		const result = applyRetentionPolicy(files, 30, now);
		expect(result.keep).toHaveLength(3);
		expect(result.remove).toHaveLength(0);
	});

	it('removes files older than retention period', () => {
		const files: readonly BackupFile[] = [makeFile(5), makeFile(31), makeFile(60)];
		const result = applyRetentionPolicy(files, 30, now);
		expect(result.keep).toHaveLength(1);
		expect(result.remove).toHaveLength(2);
	});

	it('handles empty file list', () => {
		const result = applyRetentionPolicy([], 30, now);
		expect(result.keep).toHaveLength(0);
		expect(result.remove).toHaveLength(0);
	});

	it('file exactly at retention boundary is kept', () => {
		const files: readonly BackupFile[] = [makeFile(30)];
		const result = applyRetentionPolicy(files, 30, now);
		expect(result.keep).toHaveLength(1);
		expect(result.remove).toHaveLength(0);
	});

	it('file one day past retention boundary is removed', () => {
		const files: readonly BackupFile[] = [makeFile(31)];
		const result = applyRetentionPolicy(files, 30, now);
		expect(result.keep).toHaveLength(0);
		expect(result.remove).toHaveLength(1);
	});

	it('uses Date.now() if now parameter is omitted', () => {
		const recentFile: BackupFile = {
			path: '/backups/recent.dump',
			createdAt: new Date(), // Just created
			sizeBytes: 1024,
		};
		const result = applyRetentionPolicy([recentFile], 30);
		expect(result.keep).toHaveLength(1);
		expect(result.remove).toHaveLength(0);
	});

	it('preserves file references in keep and remove arrays', () => {
		const oldFile = makeFile(60, '/backups/old.dump');
		const newFile = makeFile(5, '/backups/new.dump');
		const result = applyRetentionPolicy([oldFile, newFile], 30, now);
		expect(result.keep[0]).toBe(newFile);
		expect(result.remove[0]).toBe(oldFile);
	});

	it('sorts keep files by createdAt descending (newest first)', () => {
		const files: readonly BackupFile[] = [makeFile(20), makeFile(5), makeFile(15)];
		const result = applyRetentionPolicy(files, 30, now);
		expect(result.keep).toHaveLength(3);
		expect(result.keep[0]!.createdAt.getTime()).toBeGreaterThan(
			result.keep[1]!.createdAt.getTime(),
		);
		expect(result.keep[1]!.createdAt.getTime()).toBeGreaterThan(
			result.keep[2]!.createdAt.getTime(),
		);
	});
});

describe('calculateStorageUsage', () => {
	it('calculates total bytes and file count', () => {
		const files: readonly BackupFile[] = [
			{ path: '/a.dump', createdAt: new Date('2025-06-01'), sizeBytes: 100 },
			{ path: '/b.dump', createdAt: new Date('2025-06-02'), sizeBytes: 200 },
			{ path: '/c.dump', createdAt: new Date('2025-06-03'), sizeBytes: 300 },
		];
		const usage = calculateStorageUsage(files);
		expect(usage.totalBytes).toBe(600);
		expect(usage.fileCount).toBe(3);
	});

	it('identifies oldest and newest files', () => {
		const files: readonly BackupFile[] = [
			{ path: '/a.dump', createdAt: new Date('2025-06-10'), sizeBytes: 100 },
			{ path: '/b.dump', createdAt: new Date('2025-06-01'), sizeBytes: 200 },
			{ path: '/c.dump', createdAt: new Date('2025-06-20'), sizeBytes: 300 },
		];
		const usage = calculateStorageUsage(files);
		expect(usage.oldestFile).toEqual(new Date('2025-06-01'));
		expect(usage.newestFile).toEqual(new Date('2025-06-20'));
	});

	it('returns undefined for oldest/newest when no files', () => {
		const usage = calculateStorageUsage([]);
		expect(usage.totalBytes).toBe(0);
		expect(usage.fileCount).toBe(0);
		expect(usage.oldestFile).toBeUndefined();
		expect(usage.newestFile).toBeUndefined();
	});

	it('handles single file', () => {
		const files: readonly BackupFile[] = [
			{ path: '/a.dump', createdAt: new Date('2025-06-05'), sizeBytes: 500 },
		];
		const usage = calculateStorageUsage(files);
		expect(usage.totalBytes).toBe(500);
		expect(usage.fileCount).toBe(1);
		expect(usage.oldestFile).toEqual(new Date('2025-06-05'));
		expect(usage.newestFile).toEqual(new Date('2025-06-05'));
	});
});

describe('generateCronEntry', () => {
	const baseConfig: BackupConfig = {
		schedule: '0 2 * * *',
		retentionDays: 30,
		destination: 'local',
		localPath: '/var/backups/axel',
		compressionEnabled: true,
		databaseUrl: 'postgresql://user:pass@localhost:5432/axel',
	};

	it('starts with the cron schedule', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).toMatch(/^0 2 \* \* \*/);
	});

	it('contains the pg_dump command', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).toContain('pg_dump');
	});

	it('contains --format=custom flag', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).toContain('--format=custom');
	});

	it('contains the database URL', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).toContain(baseConfig.databaseUrl);
	});

	it('uses different schedule from config', () => {
		const config: BackupConfig = { ...baseConfig, schedule: '30 4 * * 0' };
		const entry = generateCronEntry(config);
		expect(entry).toMatch(/^30 4 \* \* 0/);
	});

	it('is a single line (no newlines)', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).not.toContain('\n');
	});

	it('includes the localPath in the output destination', () => {
		const entry = generateCronEntry(baseConfig);
		expect(entry).toContain('/var/backups/axel/');
	});
});
