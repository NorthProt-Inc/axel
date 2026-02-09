<script lang="ts">
import type { ChatMessage } from '$lib/stores/chat.svelte';
import StreamingIndicator from './StreamingIndicator.svelte';

let { messages }: { messages: { value: ChatMessage[] } } = $props();

let containerEl: HTMLDivElement;

$effect(() => {
	if (messages.value.length > 0 && containerEl) {
		containerEl.scrollTop = containerEl.scrollHeight;
	}
});
</script>

<div bind:this={containerEl} class="flex-1 overflow-y-auto px-4 py-6 space-y-4">
	{#each messages.value as message (message.id)}
		<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
			<div class="max-w-[80%] rounded-lg px-4 py-2 {
				message.role === 'user'
					? 'bg-cyan text-navy font-medium'
					: message.role === 'system'
						? 'bg-navy-mid/50 text-gray-400 text-sm'
						: 'bg-navy-mid text-white'
			}">
				<p class="whitespace-pre-wrap">{message.content}</p>
				{#if message.streaming}
					<StreamingIndicator />
				{/if}
			</div>
		</div>
	{/each}
</div>
