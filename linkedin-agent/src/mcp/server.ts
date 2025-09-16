#!/usr/bin/env node
import readline from 'node:readline';
import { cadenceService } from '../services/cadence.js';

// Minimal JSON-RPC 2.0 server over stdio. Not a full MCP implementation,
// but compatible with simple tool invocations from background agents.

type JsonRpcRequest = {
	jsonrpc: '2.0';
	id: string | number | null;
	method: string;
	params?: any;
};

type JsonRpcResponse = {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: any;
	error?: { code: number; message: string; data?: any };
};

async function handle(method: string, params: any) {
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
	let req: JsonRpcRequest | null = null;
	try {
		req = JSON.parse(line.trim());
		if (!req || typeof req !== 'object' || !('method' in (req as any))) throw new Error('Invalid request');
		const jreq = req as JsonRpcRequest;
		const result = await handle(jreq.method, jreq.params);
		const resp: JsonRpcResponse = { jsonrpc: '2.0', id: jreq.id, result };
		process.stdout.write(JSON.stringify(resp) + '\n');
	} catch (err: any) {
		const resp: JsonRpcResponse = { jsonrpc: '2.0', id: (req && req.id) ?? null, error: { code: -32603, message: err?.message ?? 'Internal error' } };
		process.stdout.write(JSON.stringify(resp) + '\n');
	}
});