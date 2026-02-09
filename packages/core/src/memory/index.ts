// Memory layer types
export type {
	MemoryLayerName,
	StreamEventType,
	StreamEvent,
	StreamBuffer,
	Turn,
	WorkingMemory,
	CreateSessionParams,
	MessageRecord,
	EpisodicMemory,
	SessionListInfo,
	NewMemory,
	SemanticQuery,
	ScoredMemory,
	DecayResult,
	DecayRunConfig,
	SemanticMemory,
	NewEntity,
	Entity,
	NewRelation,
	Relation,
	GraphNode,
	ConceptualMemory,
	AccessPattern,
	HotMemory,
	MetaMemory,
} from './types.js';

// Consolidation (L2→L3)
export {
	DEFAULT_CONSOLIDATION_CONFIG,
	EXTRACTION_PROMPT,
	formatSessionForExtraction,
	parseExtractedMemories,
	shouldConsolidate,
	type ConsolidationConfig,
	type ExtractedMemory,
	type ExtractedMemoryType,
} from './consolidation.js';

// In-memory stubs (test/dev use)
export { InMemoryStreamBuffer } from './stream-buffer.js';
export { InMemoryWorkingMemory } from './working-memory.js';
export { InMemoryEpisodicMemory } from './episodic-memory.js';
export { InMemorySemanticMemory } from './semantic-memory.js';
export { InMemoryConceptualMemory } from './conceptual-memory.js';
export { InMemoryMetaMemory } from './meta-memory.js';
