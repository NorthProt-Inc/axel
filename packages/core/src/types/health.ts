/** System health state */
export type HealthState = 'healthy' | 'degraded' | 'unhealthy';

/** Individual component health */
export interface ComponentHealth {
	readonly state: HealthState;
	readonly latencyMs: number | null;
	readonly message: string | null;
	readonly lastChecked: Date;
}

/** Aggregated system health status */
export interface HealthStatus {
	readonly state: HealthState;
	readonly checks: Readonly<Record<string, ComponentHealth>>;
	readonly timestamp: Date;
	readonly uptime: number;
}
