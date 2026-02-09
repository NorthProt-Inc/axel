<script lang="ts">
import { sessions, createSession, switchSession } from '$lib/stores/chat.svelte';

let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<!-- Overlay for mobile -->
{#if open}
	<button
		class="fixed inset-0 z-30 bg-black/50 md:hidden"
		onclick={() => open = false}
		aria-label="Close sidebar"
	></button>
{/if}

<aside class="
	{open ? 'translate-x-0' : '-translate-x-full'}
	fixed inset-y-0 left-0 z-40 w-64 border-r border-navy-mid bg-navy transition-transform
	md:static md:translate-x-0
">
	<div class="flex h-full flex-col">
		<!-- Logo + title -->
		<div class="flex items-center gap-2 border-b border-navy-mid px-4 py-3">
			<img src="/NorthProt-Circle.svg" alt="NorthProt" class="h-6 w-6" />
			<span class="text-sm font-semibold text-cyan">Axel Chat</span>
		</div>

		<!-- New chat button -->
		<div class="p-3">
			<button
				onclick={createSession}
				class="w-full rounded-lg border border-navy-mid px-3 py-2 text-sm text-gray-300 transition hover:border-cyan hover:text-white"
			>
				+ 새 대화
			</button>
		</div>

		<!-- Session list -->
		<nav class="flex-1 overflow-y-auto px-3 space-y-1">
			{#each sessions.value as session (session.id)}
				<button
					onclick={() => { switchSession(session.id); open = false; }}
					class="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition hover:bg-navy-mid hover:text-white"
				>
					{session.title}
				</button>
			{/each}
		</nav>
	</div>
</aside>
