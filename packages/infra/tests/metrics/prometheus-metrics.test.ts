import { beforeEach, describe, expect, it } from 'vitest';
import {
	Counter,
	Gauge,
	Histogram,
	MetricsRegistry,
	formatPrometheus,
} from '../../src/metrics/prometheus-metrics.js';

describe('Counter', () => {
	it('starts at 0', () => {
		const c = new Counter('test_total', 'Test counter');
		expect(c.getValue()).toBe(0);
	});

	it('increments by 1', () => {
		const c = new Counter('test_total', 'Test counter');
		c.inc();
		expect(c.getValue()).toBe(1);
	});

	it('increments by custom value', () => {
		const c = new Counter('test_total', 'Test counter');
		c.inc(5);
		expect(c.getValue()).toBe(5);
	});

	it('accumulates increments', () => {
		const c = new Counter('test_total', 'Test counter');
		c.inc(3);
		c.inc(7);
		expect(c.getValue()).toBe(10);
	});

	it('rejects negative increment', () => {
		const c = new Counter('test_total', 'Test counter');
		expect(() => c.inc(-1)).toThrow();
	});

	it('supports labels', () => {
		const c = new Counter('http_requests_total', 'HTTP requests', ['method', 'status']);
		c.inc(1, { method: 'GET', status: '200' });
		c.inc(1, { method: 'POST', status: '201' });
		c.inc(1, { method: 'GET', status: '200' });
		expect(c.getValueWithLabels({ method: 'GET', status: '200' })).toBe(2);
		expect(c.getValueWithLabels({ method: 'POST', status: '201' })).toBe(1);
	});

	it('formats to Prometheus text', () => {
		const c = new Counter('test_total', 'Test counter');
		c.inc(5);
		const output = c.toPrometheus();
		expect(output).toContain('# HELP test_total Test counter');
		expect(output).toContain('# TYPE test_total counter');
		expect(output).toContain('test_total 5');
	});

	it('formats labels in Prometheus text', () => {
		const c = new Counter('req_total', 'Requests', ['method']);
		c.inc(3, { method: 'GET' });
		const output = c.toPrometheus();
		expect(output).toContain('req_total{method="GET"} 3');
	});
});

describe('Gauge', () => {
	it('starts at 0', () => {
		const g = new Gauge('temp', 'Temperature');
		expect(g.getValue()).toBe(0);
	});

	it('sets value', () => {
		const g = new Gauge('temp', 'Temperature');
		g.set(42);
		expect(g.getValue()).toBe(42);
	});

	it('increments and decrements', () => {
		const g = new Gauge('temp', 'Temperature');
		g.inc(10);
		g.dec(3);
		expect(g.getValue()).toBe(7);
	});

	it('formats to Prometheus text', () => {
		const g = new Gauge('mem_bytes', 'Memory usage');
		g.set(1024);
		const output = g.toPrometheus();
		expect(output).toContain('# TYPE mem_bytes gauge');
		expect(output).toContain('mem_bytes 1024');
	});
});

describe('Histogram', () => {
	it('starts empty', () => {
		const h = new Histogram('latency', 'Latency', [0.1, 0.5, 1, 5]);
		expect(h.getCount()).toBe(0);
		expect(h.getSum()).toBe(0);
	});

	it('observes values', () => {
		const h = new Histogram('latency', 'Latency', [0.1, 0.5, 1, 5]);
		h.observe(0.3);
		h.observe(0.7);
		expect(h.getCount()).toBe(2);
		expect(h.getSum()).toBeCloseTo(1.0);
	});

	it('counts buckets correctly', () => {
		const h = new Histogram('latency', 'Latency', [0.1, 0.5, 1, 5]);
		h.observe(0.05); // <= 0.1, 0.5, 1, 5
		h.observe(0.3); // <= 0.5, 1, 5
		h.observe(0.7); // <= 1, 5
		h.observe(3); // <= 5
		h.observe(10); // <= +Inf only

		const buckets = h.getBuckets();
		expect(buckets.get(0.1)).toBe(1);
		expect(buckets.get(0.5)).toBe(2);
		expect(buckets.get(1)).toBe(3);
		expect(buckets.get(5)).toBe(4);
	});

	it('formats to Prometheus text with buckets', () => {
		const h = new Histogram('latency', 'Latency', [0.1, 1]);
		h.observe(0.05);
		h.observe(0.5);
		const output = h.toPrometheus();
		expect(output).toContain('# TYPE latency histogram');
		expect(output).toContain('latency_bucket{le="0.1"} 1');
		expect(output).toContain('latency_bucket{le="1"} 2');
		expect(output).toContain('latency_bucket{le="+Inf"} 2');
		expect(output).toContain('latency_count 2');
		expect(output).toContain('latency_sum 0.55');
	});
});

describe('MetricsRegistry', () => {
	let registry: MetricsRegistry;

	beforeEach(() => {
		registry = new MetricsRegistry();
	});

	it('registers and retrieves counters', () => {
		const c = registry.counter('test_total', 'Test');
		c.inc();
		expect(registry.getCounter('test_total')?.getValue()).toBe(1);
	});

	it('registers and retrieves gauges', () => {
		const g = registry.gauge('test_gauge', 'Test');
		g.set(42);
		expect(registry.getGauge('test_gauge')?.getValue()).toBe(42);
	});

	it('registers and retrieves histograms', () => {
		const h = registry.histogram('test_hist', 'Test', [1, 5, 10]);
		h.observe(3);
		expect(registry.getHistogram('test_hist')?.getCount()).toBe(1);
	});

	it('rejects duplicate metric names', () => {
		registry.counter('test_total', 'Test');
		expect(() => registry.counter('test_total', 'Dupe')).toThrow('already registered');
	});

	it('returns null for unregistered metrics', () => {
		expect(registry.getCounter('nonexistent')).toBeNull();
		expect(registry.getGauge('nonexistent')).toBeNull();
		expect(registry.getHistogram('nonexistent')).toBeNull();
	});
});

describe('formatPrometheus', () => {
	it('formats full registry to Prometheus exposition format', () => {
		const registry = new MetricsRegistry();
		const c = registry.counter('requests_total', 'Total requests');
		c.inc(100);
		const g = registry.gauge('active_connections', 'Active connections');
		g.set(5);

		const output = formatPrometheus(registry);
		expect(output).toContain('# HELP requests_total Total requests');
		expect(output).toContain('requests_total 100');
		expect(output).toContain('active_connections 5');
	});

	it('returns empty string for empty registry', () => {
		const registry = new MetricsRegistry();
		expect(formatPrometheus(registry)).toBe('');
	});
});
