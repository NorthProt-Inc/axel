
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const GATEWAY_URL: string;
	export const GITHUB_TOKEN: string;
	export const AXEL_GATEWAY_CORS_ORIGINS: string;
	export const AXEL_REDIS_URL: string;
	export const npm_package_devDependencies_vitest: string;
	export const USER: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const LC_TIME: string;
	export const npm_config_user_agent: string;
	export const GIT_EDITOR: string;
	export const npm_package_devDependencies__sveltejs_vite_plugin_svelte: string;
	export const npm_package_devDependencies_vite: string;
	export const npm_node_execpath: string;
	export const SHLVL: string;
	export const HOME: string;
	export const OLDPWD: string;
	export const npm_package_dependencies_shiki: string;
	export const OPENAI_API_KEY: string;
	export const GTK_MODULES: string;
	export const npm_package_devDependencies_svelte_check: string;
	export const LC_MONETARY: string;
	export const MANAGERPID: string;
	export const SYSTEMD_EXEC_PID: string;
	export const GSM_SKIP_SSH_AGENT_WORKAROUND: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const npm_package_devDependencies_tailwindcss: string;
	export const npm_package_devDependencies_typescript: string;
	export const TRIGGER_TIMER_REALTIME_USEC: string;
	export const npm_package_scripts_dev: string;
	export const GTK_IM_MODULE: string;
	export const LOGNAME: string;
	export const npm_package_type: string;
	export const JOURNAL_STREAM: string;
	export const _: string;
	export const npm_package_private: string;
	export const npm_package_devDependencies__sveltejs_adapter_node: string;
	export const MEMORY_PRESSURE_WATCH: string;
	export const npm_config_registry: string;
	export const OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
	export const npm_package_devDependencies__tailwindcss_vite: string;
	export const npm_config_node_gyp: string;
	export const PATH: string;
	export const INVOCATION_ID: string;
	export const NODE: string;
	export const npm_package_name: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const LC_ADDRESS: string;
	export const XDG_RUNTIME_DIR: string;
	export const npm_package_dependencies_marked: string;
	export const npm_config_frozen_lockfile: string;
	export const AXEL_GOOGLE_API_KEY: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const LANG: string;
	export const AXEL_ANTHROPIC_API_KEY: string;
	export const LC_TELEPHONE: string;
	export const XMODIFIERS: string;
	export const npm_lifecycle_script: string;
	export const SSH_AUTH_SOCK: string;
	export const npm_package_scripts_test: string;
	export const npm_package_devDependencies__sveltejs_kit: string;
	export const SHELL: string;
	export const LC_NAME: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const NODE_PATH: string;
	export const QT_ACCESSIBILITY: string;
	export const npm_package_scripts_build: string;
	export const npm_package_devDependencies_svelte: string;
	export const npm_config_workspace_concurrency: string;
	export const TRIGGER_UNIT: string;
	export const CLAUDECODE: string;
	export const LC_MEASUREMENT: string;
	export const LC_IDENTIFICATION: string;
	export const npm_package_scripts_typecheck: string;
	export const AXEL_CHANNELS_CLI_ENABLED: string;
	export const QT_IM_MODULE: string;
	export const npm_package_scripts_test_watch: string;
	export const PWD: string;
	export const AXEL_DB_URL: string;
	export const npm_execpath: string;
	export const GEMINI_API_KEY: string;
	export const TRIGGER_TIMER_MONOTONIC_USEC: string;
	export const XDG_DATA_DIRS: string;
	export const npm_config_recursive: string;
	export const LC_NUMERIC: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const npm_command: string;
	export const LC_PAPER: string;
	export const AXEL_GATEWAY_AUTH_TOKEN: string;
	export const npm_package_scripts_preview: string;
	export const MEMORY_PRESSURE_WRITE: string;
	export const npm_package_dependencies__axel_ui: string;
	export const INIT_CWD: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	export const PUBLIC_WS_URL: string;
	export const PUBLIC_API_TOKEN: string;
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		GATEWAY_URL: string;
		GITHUB_TOKEN: string;
		AXEL_GATEWAY_CORS_ORIGINS: string;
		AXEL_REDIS_URL: string;
		npm_package_devDependencies_vitest: string;
		USER: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		LC_TIME: string;
		npm_config_user_agent: string;
		GIT_EDITOR: string;
		npm_package_devDependencies__sveltejs_vite_plugin_svelte: string;
		npm_package_devDependencies_vite: string;
		npm_node_execpath: string;
		SHLVL: string;
		HOME: string;
		OLDPWD: string;
		npm_package_dependencies_shiki: string;
		OPENAI_API_KEY: string;
		GTK_MODULES: string;
		npm_package_devDependencies_svelte_check: string;
		LC_MONETARY: string;
		MANAGERPID: string;
		SYSTEMD_EXEC_PID: string;
		GSM_SKIP_SSH_AGENT_WORKAROUND: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		npm_package_devDependencies_tailwindcss: string;
		npm_package_devDependencies_typescript: string;
		TRIGGER_TIMER_REALTIME_USEC: string;
		npm_package_scripts_dev: string;
		GTK_IM_MODULE: string;
		LOGNAME: string;
		npm_package_type: string;
		JOURNAL_STREAM: string;
		_: string;
		npm_package_private: string;
		npm_package_devDependencies__sveltejs_adapter_node: string;
		MEMORY_PRESSURE_WATCH: string;
		npm_config_registry: string;
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
		npm_package_devDependencies__tailwindcss_vite: string;
		npm_config_node_gyp: string;
		PATH: string;
		INVOCATION_ID: string;
		NODE: string;
		npm_package_name: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		LC_ADDRESS: string;
		XDG_RUNTIME_DIR: string;
		npm_package_dependencies_marked: string;
		npm_config_frozen_lockfile: string;
		AXEL_GOOGLE_API_KEY: string;
		NoDefaultCurrentDirectoryInExePath: string;
		LANG: string;
		AXEL_ANTHROPIC_API_KEY: string;
		LC_TELEPHONE: string;
		XMODIFIERS: string;
		npm_lifecycle_script: string;
		SSH_AUTH_SOCK: string;
		npm_package_scripts_test: string;
		npm_package_devDependencies__sveltejs_kit: string;
		SHELL: string;
		LC_NAME: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		NODE_PATH: string;
		QT_ACCESSIBILITY: string;
		npm_package_scripts_build: string;
		npm_package_devDependencies_svelte: string;
		npm_config_workspace_concurrency: string;
		TRIGGER_UNIT: string;
		CLAUDECODE: string;
		LC_MEASUREMENT: string;
		LC_IDENTIFICATION: string;
		npm_package_scripts_typecheck: string;
		AXEL_CHANNELS_CLI_ENABLED: string;
		QT_IM_MODULE: string;
		npm_package_scripts_test_watch: string;
		PWD: string;
		AXEL_DB_URL: string;
		npm_execpath: string;
		GEMINI_API_KEY: string;
		TRIGGER_TIMER_MONOTONIC_USEC: string;
		XDG_DATA_DIRS: string;
		npm_config_recursive: string;
		LC_NUMERIC: string;
		PNPM_SCRIPT_SRC_DIR: string;
		npm_command: string;
		LC_PAPER: string;
		AXEL_GATEWAY_AUTH_TOKEN: string;
		npm_package_scripts_preview: string;
		MEMORY_PRESSURE_WRITE: string;
		npm_package_dependencies__axel_ui: string;
		INIT_CWD: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		PUBLIC_WS_URL: string;
		PUBLIC_API_TOKEN: string;
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
