/**
 * Copy some fs-extra util implementations
 * https://github.com/jprichardson/node-fs-extra
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Almost the same as `writeFileSync` (i.e. it overwrites), except that if the parent directory does not exist, it's created. 
 * `file` must be a file path (a buffer or a file descriptor is not allowed).
 * @param {*} file 
 * @param  {...any} args 
 */
export function outputFileSync(file, ...args) {
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(file, ...args);
}

/**
 * Reads a JSON file and then parses it into an object.
 * @param {*} file 
 * @param {*} options 
 * @returns 
 */
export function readJsonSync(file, options = {}) {
  if (typeof options === 'string') {
    options = { encoding: options };
  }

  const shouldThrow = 'throws' in options ? options.throws : true;

  try {
    let content = readFileSync(file, options);
    content = stripBom(content);
    return JSON.parse(content, options.reviver);
  } catch (err) {
    if (shouldThrow) {
      err.message = `${file}: ${err.message}`;
      throw err;
    } else {
      return null;
    }
  }
}

/** 
 * Takes an object and returns a stringified output
 * @param {*} obj 
 * @param {*} options
 * @returns 
 */
export function stringify(obj, { EOL = '\n', finalEOL = true, replacer = null, spaces } = {}) {
  const EOF = finalEOL ? EOL : '';
  const str = JSON.stringify(obj, replacer, spaces);

  return str.replace(/\n/g, EOL) + EOF;
}

export function stripBom(content) {
  // we do this because JSON.parse would convert it to a utf8 string if encoding wasn't specified
  if (Buffer.isBuffer(content)) {
    content = content.toString('utf8');
  }
  return content.replace(/^\uFEFF/, '');
}

/**
 * Writes an object to a JSON file, ie: `fs.writeJsonSync('./package.json', {name: 'fs-extra'})`
 * @param {*} file 
 * @param {*} obj 
 * @param {*} options - `spaces` Number of spaces to indent; or a string to use for indentation (i.e. pass `'\t'` for tab indentation). See the docs for more info.
 * `EOL` Set EOL character. Default is \n. replacer JSON replacer
 * @returns 
 */
export function writeJsonSync(file, obj, options = {}) {
  const str = stringify(obj, options);
  // not sure if fs.writeFileSync returns anything, but just in case
  return writeFileSync(file, str, options);
}
