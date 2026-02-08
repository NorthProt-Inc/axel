import { z } from 'zod';

/** Zod schema for per-channel adaptation config */
export const ChannelAdaptationSchema = z.object({
	formality: z.number().min(0).max(1),
	verbosity: z.number().min(0).max(1),
});

/** Per-channel formality/verbosity adaptation */
export type ChannelAdaptation = z.infer<typeof ChannelAdaptationSchema>;

/** Default channel adaptations per plan §L4 (lines 1214-1221) */
export const CHANNEL_ADAPTATIONS: Readonly<Record<string, ChannelAdaptation>> = {
	discord: { formality: 0.2, verbosity: 0.3 },
	telegram: { formality: 0.1, verbosity: 0.2 },
	slack: { formality: 0.5, verbosity: 0.5 },
	cli: { formality: 0.0, verbosity: 0.4 },
	email: { formality: 0.7, verbosity: 0.8 },
	webchat: { formality: 0.3, verbosity: 0.5 },
};
