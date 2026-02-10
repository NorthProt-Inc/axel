/**
 * Prometheus-compatible metrics — lightweight, no external dependencies.
 *
 * Supports Counter, Gauge, and Histogram metric types.
 * Outputs Prometheus exposition format text via formatPrometheus().
 */

// ─── Metric Interface ───

interface Metric {
	readonly name: string;
	readonly help: string;
	toPrometheus(): string;
}

// ─── Label Helpers ───

function labelKey(labels: Readonly<Record<string, string>>): string {
	const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
	return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

function formatLabels(labels: Readonly<Record<string, string>>): string {
	const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) return '';
	return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

// ─── Counter ───

class Counter implements Metric {
	readonly name: string;
	readonly help: string;
	private readonly labelNames: readonly string[];
	private value = 0;
	private readonly labeledValues = new Map<
		string,
		{ labels: Readonly<Record<string, string>>; value: number }
	>();

	constructor(name: string, help: string, labelNames?: readonly string[]) {
		this.name = name;
		this.help = help;
		this.labelNames = labelNames ?? [];
	}

	inc(amount = 1, labels?: Readonly<Record<string, string>>): void {
		if (amount < 0) {
			throw new Error('Counter increment must be non-negative');
		}
		if (labels && this.labelNames.length > 0) {
			const key = labelKey(labels);
			const existing = this.labeledValues.get(key);
			if (existing) {
				existing.value += amount;
			} else {
				this.labeledValues.set(key, { labels, value: amount });
			}
		} else {
			this.value += amount;
		}
	}

	getValue(): number {
		return this.value;
	}

	getValueWithLabels(labels: Readonly<Record<string, string>>): number {
		const key = labelKey(labels);
		return this.labeledValues.get(key)?.value ?? 0;
	}

	toPrometheus(): string {
		const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];

		if (this.labeledValues.size > 0) {
			for (const { labels, value } of this.labeledValues.values()) {
				lines.push(`${this.name}${formatLabels(labels)} ${value}`);
			}
		} else {
			lines.push(`${this.name} ${this.value}`);
		}

		return lines.join('\n');
	}
}

// ─── Gauge ───

class Gauge implements Metric {
	readonly name: string;
	readonly help: string;
	private value = 0;

	constructor(name: string, help: string) {
		this.name = name;
		this.help = help;
	}

	set(value: number): void {
		this.value = value;
	}

	inc(amount = 1): void {
		this.value += amount;
	}

	dec(amount = 1): void {
		this.value -= amount;
	}

	getValue(): number {
		return this.value;
	}

	toPrometheus(): string {
		return [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} gauge`,
			`${this.name} ${this.value}`,
		].join('\n');
	}
}

// ─── Histogram ───

class Histogram implements Metric {
	readonly name: string;
	readonly help: string;
	private readonly bucketBoundaries: readonly number[];
	private readonly bucketCounts: Map<number, number>;
	private count = 0;
	private sum = 0;

	constructor(name: string, help: string, buckets: readonly number[]) {
		this.name = name;
		this.help = help;
		this.bucketBoundaries = [...buckets].sort((a, b) => a - b);
		this.bucketCounts = new Map();
		for (const b of this.bucketBoundaries) {
			this.bucketCounts.set(b, 0);
		}
	}

	observe(value: number): void {
		this.count += 1;
		this.sum += value;
		for (const boundary of this.bucketBoundaries) {
			if (value <= boundary) {
				this.bucketCounts.set(boundary, (this.bucketCounts.get(boundary) ?? 0) + 1);
			}
		}
	}

	getCount(): number {
		return this.count;
	}

	getSum(): number {
		return this.sum;
	}

	getBuckets(): ReadonlyMap<number, number> {
		return this.bucketCounts;
	}

	toPrometheus(): string {
		const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
		for (const boundary of this.bucketBoundaries) {
			lines.push(`${this.name}_bucket{le="${boundary}"} ${this.bucketCounts.get(boundary) ?? 0}`);
		}
		lines.push(`${this.name}_bucket{le="+Inf"} ${this.count}`);
		lines.push(`${this.name}_count ${this.count}`);
		lines.push(`${this.name}_sum ${this.sum}`);
		return lines.join('\n');
	}
}

// ─── Registry ───

class MetricsRegistry {
	private readonly metrics = new Map<string, Metric>();

	counter(name: string, help: string, labelNames?: readonly string[]): Counter {
		if (this.metrics.has(name)) {
			throw new Error(`Metric '${name}' already registered`);
		}
		const c = new Counter(name, help, labelNames);
		this.metrics.set(name, c);
		return c;
	}

	gauge(name: string, help: string): Gauge {
		if (this.metrics.has(name)) {
			throw new Error(`Metric '${name}' already registered`);
		}
		const g = new Gauge(name, help);
		this.metrics.set(name, g);
		return g;
	}

	histogram(name: string, help: string, buckets: readonly number[]): Histogram {
		if (this.metrics.has(name)) {
			throw new Error(`Metric '${name}' already registered`);
		}
		const h = new Histogram(name, help, buckets);
		this.metrics.set(name, h);
		return h;
	}

	getCounter(name: string): Counter | null {
		const m = this.metrics.get(name);
		return m instanceof Counter ? m : null;
	}

	getGauge(name: string): Gauge | null {
		const m = this.metrics.get(name);
		return m instanceof Gauge ? m : null;
	}

	getHistogram(name: string): Histogram | null {
		const m = this.metrics.get(name);
		return m instanceof Histogram ? m : null;
	}

	getAll(): readonly Metric[] {
		return [...this.metrics.values()];
	}
}

// ─── Formatter ───

function formatPrometheus(registry: MetricsRegistry): string {
	const metrics = registry.getAll();
	if (metrics.length === 0) return '';
	return metrics.map((m) => m.toPrometheus()).join('\n\n');
}

export { Counter, Gauge, Histogram, MetricsRegistry, formatPrometheus, type Metric };
