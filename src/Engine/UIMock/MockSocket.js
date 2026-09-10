/**
 * Engine/UIMock/MockSocket.js
 *
 * Mock socket for the UViewer server.
 *
 * Implements the socket contract NetworkManager binds to (see
 * Engine/Replay/ReplaySocket.js): async `onComplete(true)` on connect,
 * `onMessage`/`onClose` callbacks and a `push()` helper to feed binary
 * server→client packets into the real receive pipeline.
 *
 * Unlike the replay socket it also *parses* the outgoing client→server
 * stream: packets are framed with the packet-version rows attached to each
 * PACKET.CZ.* struct (the same rows the client's own `build()` uses), so
 * framing stays correct at any packetver even though opcodes and layouts
 * shift between versions. Framing with the inbound PacketLength tables
 * instead would desync — those tables describe what the *server* emits and
 * disagree with the client rows on several packets (e.g. CZ.REQ_WEAR_EQUIP).
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import Configs from 'Core/Configs.js';
import PACKET from 'Network/PacketStructure.js';

/**
 * A few legacy client packets build their bytes with hardcoded opcodes and no
 * version row (see their `build()` in Network/PacketStructure.js), so they
 * would be missing from the index and break stream framing. opcode → length
 * (-1 = variable, u16 length field at offset 2).
 */
const STATIC_LENGTHS = {
	0x0090: 7,   // CZ.CONTACTNPC
	0x0096: -1   // CZ.WHISPER (length field at offset 2)
};

/**
 * Build an opcode → version-row index of every packet the client can emit
 * at the current PACKETVER.
 *
 * Each row is `[date, Struct, opcode, length, ...fieldOffsets]` (see
 * Network/PacketVersions.js and PacketVerManager.getPacketVersion). When two
 * structs resolve to the same opcode the row with the latest date wins: base
 * rows (date 0) are stale leftovers that are never actually sent at modern
 * packetvers.
 *
 * @returns {Map<number, object>} opcode → { struct, opcode, length, offsets }
 */
export function buildOutboundIndex() {
	const index = new Map();

	for (const namespace of [PACKET.CZ, PACKET.CS, PACKET.CA]) {
		for (const struct of Object.values(namespace)) {
			if (!struct?.prototype?.versions?.length) {
				continue;
			}

			const row = struct.prototype.getPacketVersion();
			const existing = index.get(row[1]);

			if (!existing || existing.date <= row[0]) {
				index.set(row[1], {
					date: row[0],
					struct: struct,
					opcode: row[1],
					length: row[2],
					offsets: row.slice(3)
				});
			}
		}
	}

	// Version rows win; only fill the hardcoded-layout gaps.
	for (const [opcode, length] of Object.entries(STATIC_LENGTHS)) {
		if (!index.has(+opcode)) {
			index.set(+opcode, { date: 0, struct: null, opcode: +opcode, length, offsets: [2] });
		}
	}

	return index;
}

export default class MockSocket {
	/**
	 * @param {string} host
	 * @param {number} port
	 * @param {object} server - MockServer-like dispatcher:
	 *        `outboundIndex` (Map from buildOutboundIndex, optional),
	 *        `onOutbound(opcode, view, len)` called per framed client packet.
	 */
	constructor(host, port, server) {
		this.host = host;
		this.port = port;
		this.connected = false;

		// The NetworkManager binds to these
		this.onMessage = null;
		this.onClose = null;
		this.onError = null;
		this.onComplete = null;

		this._server = server;
		this._save = null;

		// With packetKeys configured the client XOR-encrypts outbound opcodes,
		// framing becomes impossible: degrade to log-only.
		this._canParseOutbound = !Configs.get('packetKeys');
		this._warnedUnframed = false;

		// Simulate async connection
		setTimeout(() => {
			this.connected = true;
			if (this.onComplete) {
				this.onComplete(true);
			}
		}, 10);
	}

	/**
	 * Client → "server": frame the outgoing stream and dispatch each packet.
	 *
	 * @param {ArrayBuffer} buffer
	 */
	send(buffer) {
		if (!this._canParseOutbound) {
			if (!this._warnedUnframed) {
				this._warnedUnframed = true;
				console.warn('[UViewer] packetKeys is configured — outbound packets cannot be parsed, ignoring them.');
			}
			return;
		}

		if (this._save) {
			const data = new Uint8Array(this._save.length + buffer.byteLength);
			data.set(this._save, 0);
			data.set(new Uint8Array(buffer), this._save.length);
			buffer = data.buffer;
		}

		const index = this._server?.outboundIndex || buildOutboundIndex();
		const view = new DataView(buffer);
		let offset = 0;

		while (offset + 2 <= buffer.byteLength) {
			const opcode = view.getUint16(offset, true);
			const entry = index.get(opcode);
			let length;

			if (entry && entry.length < 0) {
				// variable length: u16 length field (offsets[0] is its position)
				const lenAt = entry.offsets[0] !== undefined ? entry.offsets[0] : 2;
				if (offset + lenAt + 2 > buffer.byteLength) {
					break; // wait for more bytes
				}
				length = view.getUint16(offset + lenAt, true);
			} else if (entry) {
				length = entry.length;
			} else {
				// Not a known client packet at this packetver — cannot frame
				this._warnUnknownOutbound(opcode);
				this._save = null;
				return;
			}

			if (length <= 0 || offset + length > buffer.byteLength) {
				break; // incomplete, wait for more bytes
			}

			try {
				this._server?.onOutbound(opcode, new DataView(buffer, offset, length), length);
			} catch (e) {
				console.error('[UViewer] outbound handler error (opcode 0x' + opcode.toString(16) + '):', e);
			}

			offset += length;
		}

		this._save = offset < buffer.byteLength ? new Uint8Array(buffer, offset, buffer.byteLength - offset) : null;
	}

	_warnUnknownOutbound(opcode) {
		console.warn(
			'[UViewer] Unknown outbound packet 0x' + opcode.toString(16) + ' at packetver ' +
			'(rest of the buffer dropped)'
		);
	}

	close() {
		this.connected = false;
		if (this.onClose) {
			this.onClose();
		}
	}

	/**
	 * Feed server→client data into NetworkManager
	 * @param {Uint8Array|ArrayBuffer} data
	 */
	push(data) {
		if (!this.connected || !this.onMessage || !data) {
			return;
		}

		let buffer;
		if (data instanceof Uint8Array) {
			buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
		} else if (data instanceof ArrayBuffer) {
			buffer = data;
		} else {
			return;
		}

		this.onMessage(buffer);
	}
}
