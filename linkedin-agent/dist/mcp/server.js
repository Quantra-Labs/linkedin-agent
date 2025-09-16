#!/usr/bin/env node
import readline from 'node:readline';
import { cadenceService } from '../services/cadence.js';
async function handle(method, params) {
    switch (method) {
        case 'scheduler.run': {
            const processed = await cadenceService.processDueAssignments();
            return { processed };
        }
        case 'assignment.scheduleNext': {
            const { assignmentId } = params ?? {};
            await cadenceService.scheduleNextStep(assignmentId);
            return { ok: true };
        }
        default:
            throw new Error(`Method not found: ${method}`);
    }
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', async (line) => {
    let req = null;
    try {
        req = JSON.parse(line.trim());
        if (!req || typeof req !== 'object' || !('method' in req))
            throw new Error('Invalid request');
        const jreq = req;
        const result = await handle(jreq.method, jreq.params);
        const resp = { jsonrpc: '2.0', id: jreq.id, result };
        process.stdout.write(JSON.stringify(resp) + '\n');
    }
    catch (err) {
        const resp = { jsonrpc: '2.0', id: (req && req.id) ?? null, error: { code: -32603, message: err?.message ?? 'Internal error' } };
        process.stdout.write(JSON.stringify(resp) + '\n');
    }
});
