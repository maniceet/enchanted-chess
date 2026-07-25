import { start } from './index';

/** Production entry point. Everything else is importable, so tests can run the same server
 *  on an ephemeral port without touching this file. */
start();
