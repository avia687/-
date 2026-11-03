// Standalone launcher (development / headless). The desktop app uses electron/main.cjs instead.
import os from 'node:os';
import path from 'node:path';
import { startServer } from './server.js';

const port = Number(process.env.PORT || 4777);
const exportDir = process.env.AUTOEDIT_EXPORTS || path.join(os.homedir(), 'Videos', 'AutoEdit');
const s = await startServer({ port, exportDir });
console.log(`AutoEdit is running at ${s.url}`);
