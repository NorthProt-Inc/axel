<script>
import '../app.css';

let { children } = $props();
</script>

<div class="min-h-screen bg-navy text-white font-sans">
	{@render children()}
</div>
