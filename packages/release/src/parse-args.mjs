/**
 * @typedef {Object} ArgumentOptions
 * @property {string} type - The type of the argument (e.g., "string" or "boolean").
 * @property {string} description - A description of the argument.
 */

/**
 * Parses command line arguments into an object.
 * 
 * This function is similar to `parseArgs()` from Node.js, but it also accepts
 * options in both camelCase and snake-case (e.g., `--camelCase` and `--snake-case`).
 * Boolean options can be negated using the `--no-` prefix (e.g., `--no-camelCase` or `--no-snake-case`).
 * 
 * @param {Object<string, ArgumentOptions>} args - An object describing the expected command line arguments.
 * @returns {Object} An object containing the parsed command line arguments.
 */
export function parseArgs(args) {
  const result = {};
  const argv = process.argv.slice(2);

  for (const key in args) {
    const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    const camelKey = key;

    // Check if the option is present
    const index = argv.findIndex(arg => arg === `--${kebabKey}` || arg === `--${camelKey}`);
    if (index !== -1) {
      if (args[key].type === 'boolean') {
        result[key] = true;
      } else if (args[key].type === 'string') {
        result[key] = argv[index + 1];
      } else {
        throw new Error(`Unsupported type: ${args[key].type}`);
      }
    } else {
      // Check if the negated option is present
      const negatedIndex = argv.findIndex(arg => arg === `--no-${kebabKey}` || arg === `--no-${camelKey}`);
      if (negatedIndex !== -1 && args[key].type === 'boolean') {
        result[key] = false;
      }
    }
  }

  // handle help and version options
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Commands:');
    console.log('  cli.mjs [option]  Run a release by bumping package version');
    console.log('');
    console.log('Options:');
    const options = Object.keys(args).map(key => ({
      key: key.replace(/([A-Z])/g, '-$1').toLowerCase(),
      description: args[key].description,
      type: args[key].type === 'boolean' ? '[boolean]' : '[string]',
    }));
    options.push({
      key: 'version',
      description: 'Show version number',
      type: '[boolean]',
    });
    const maxKeyLength = Math.max(...options.map(option => option.key.length));
    const maxDescriptionLength = Math.max(...options.map(option => option.description.length));
    for (const option of options) {
      console.log(`      --${option.key.padEnd(maxKeyLength)}  ${option.description.padEnd(maxDescriptionLength)}  ${option.type}`);
    }
    process.exit(0);
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log('0.1.6'); // replace with your actual version
    process.exit(0);
  }

  return result;
}
