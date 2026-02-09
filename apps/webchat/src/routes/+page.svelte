<script lang="ts">
import { onMount } from 'svelte';
import { PUBLIC_WS_URL, PUBLIC_API_TOKEN } from '$env/static/public';
import MessageList from '$lib/components/MessageList.svelte';
import MessageInput from '$lib/components/MessageInput.svelte';
import ChatSidebar from '$lib/components/ChatSidebar.svelte';
import { messages, sendMessage, connectWebSocket, loadSessions } from '$lib/stores/chat.svelte';

let sidebarOpen = $state(false);

onMount(async () => {
	connectWebSocket(PUBLIC_WS_URL, PUBLIC_API_TOKEN);
	await loadSessions();
});

function handleSend(content: string) {
	sendMessage(content);
}
</script>

<svelte:head>
	<title>Axel — Chat</title>
</svelte:head>

<div class="flex h-screen">
	<!-- Sidebar -->
	<ChatSidebar bind:open={sidebarOpen} />

	<!-- Main chat area -->
	<main class="flex flex-1 flex-col">
		<!-- Header -->
		<header class="flex items-center gap-3 border-b border-navy-mid px-4 py-3">
			<button
				class="text-gray-400 hover:text-cyan md:hidden"
				onclick={() => sidebarOpen = !sidebarOpen}
				aria-label="Toggle sidebar"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<img src="/NorthProt.svg" alt="NorthProt" class="h-8 w-8" />
			<h1 class="text-lg font-semibold">Axel</h1>
		</header>

		<!-- Messages -->
		<MessageList messages={messages} />

		<!-- Input -->
		<MessageInput onSend={handleSend} />
	</main>
</div>
