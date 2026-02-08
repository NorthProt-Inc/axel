<script lang="ts">
	let { onSend }: { onSend: (content: string) => void } = $props();

	let input = $state('');

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = input.trim();
		if (trimmed.length === 0) return;
		onSend(trimmed);
		input = '';
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			const trimmed = input.trim();
			if (trimmed.length === 0) return;
			onSend(trimmed);
			input = '';
		}
	}
</script>

<form onsubmit={handleSubmit} class="border-t border-navy-mid px-4 py-3">
	<div class="flex items-end gap-2">
		<textarea
			bind:value={input}
			onkeydown={handleKeyDown}
			placeholder="메시지를 입력하세요..."
			rows="1"
			class="flex-1 resize-none rounded-lg bg-navy-mid px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan font-sans"
		></textarea>
		<button
			type="submit"
			disabled={input.trim().length === 0}
			class="rounded-lg bg-cyan px-4 py-2 font-semibold text-navy transition hover:bg-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			전송
		</button>
	</div>
</form>
