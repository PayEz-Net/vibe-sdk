/**
 * Vibe CLI
 *
 * Command-line interface for Vibe operations.
 *
 * Usage:
 *   npx vibe sync           # Sync types from Vibe API
 *   npx vibe sync --debug   # Sync with debug logging
 */

import { generateTypes, resolveGeneratorOptions } from './type-generator';

const HELP_TEXT = `
@vibe/next-plugin CLI

Usage:
  npx vibe <command> [options]

Commands:
  sync          Fetch schemas and generate TypeScript types
  help          Show this help message

Options:
  --debug       Enable debug logging
  --output      Output directory (default: node_modules/.vibe/types)
  --api-url     Vibe API URL (default: VIBE_API_URL env var)
  --client-id   Client ID (default: VIBE_CLIENT_ID env var)

Environment Variables:
  VIBE_API_URL          Vibe API base URL
  VIBE_CLIENT_ID        Client ID for authentication
  VIBE_CLIENT_SECRET    Client secret for authentication

Examples:
  npx vibe sync
  npx vibe sync --debug
  npx vibe sync --output ./types/vibe
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (command === 'sync') {
    await runSync(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }
}

async function runSync(args: string[]): Promise<void> {
  // Parse arguments
  const debug = args.includes('--debug');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
  const apiUrlIndex = args.indexOf('--api-url');
  const apiUrl = apiUrlIndex !== -1 ? args[apiUrlIndex + 1] : undefined;
  const clientIdIndex = args.indexOf('--client-id');
  const clientId = clientIdIndex !== -1 ? args[clientIdIndex + 1] : undefined;

  console.log('[vibe] Syncing types from Vibe API...\n');

  const options = resolveGeneratorOptions({
    apiUrl,
    clientId,
    outputDir: output,
    debug,
  });

  if (!options.apiUrl) {
    console.error('Error: VIBE_API_URL is not set.');
    console.error('Set the VIBE_API_URL environment variable or use --api-url flag.');
    process.exit(1);
  }

  if (debug) {
    console.log('Configuration:');
    console.log(`  API URL: ${options.apiUrl}`);
    console.log(`  Client ID: ${options.clientId || '(not set)'}`);
    console.log(`  Output: ${options.outputDir}`);
    console.log('');
  }

  try {
    const result = await generateTypes(options);

    if (result.success) {
      console.log(`\nSuccess! Generated types for ${result.collections.length} collections:`);
      for (const collection of result.collections) {
        console.log(`  - ${collection}`);
      }
      console.log(`\nOutput: ${result.outputPath}`);
      console.log('\nYou can now import types from "@vibe/types":');
      console.log('  import type { Product } from "@vibe/types";');
    } else {
      console.error(`\nError: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\nFailed to sync types:', error);
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
