import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'Network/NetworkManager.js'; // side effect: attaches packet version rows
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import MockSocket, { buildOutboundIndex } from 'Engine/UIMock/MockSocket.js';

/**
 * Outbound packets are crafted with the client's own build() functions, so
 * the socket is exercised against exactly the bytes the real client emits.
 */
describe('MockSocket', () => {
	let server;
	let socket;

	function makeServer() {
		return {
			outboundIndex: buildOutboundIndex(),
			onOutbound: vi.fn()
		};
	}

	beforeEach(() => {
		PACKETVER.value = 20211103;
		server = makeServer();
		socket = new MockSocket('127.0.0.1', 6900, server);
	});

	it('connects asynchronously', async () => {
		let connected = false;
		socket.onComplete = success => {
			connected = success;
		};
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(connected).toBe(true);
	});

	it('frames a single fixed-length outbound packet', () => {
		const pkt = new PACKET.CZ.USE_ITEM();
		pkt.index = 5;
		pkt.AID = 2000001;
		socket.send(pkt.build().buffer);

		expect(server.onOutbound).toHaveBeenCalledTimes(1);
		const [opcode] = server.onOutbound.mock.calls[0];
		expect(opcode).toBe(PACKET.CZ.USE_ITEM.prototype.getPacketVersion()[1]);
	});

	it('frames multiple concatenated packets in one buffer', () => {
		const use = new PACKET.CZ.USE_ITEM();
		use.index = 1;
		const wear = new PACKET.CZ.REQ_WEAR_EQUIP();
		wear.index = 2;
		wear.wearLocation = 4;

		const a = new Uint8Array(use.build().buffer);
		const b = new Uint8Array(wear.build().buffer);
		const stream = new Uint8Array(a.length + b.length);
		stream.set(a, 0);
		stream.set(b, a.length);

		socket.send(stream.buffer);

		expect(server.onOutbound).toHaveBeenCalledTimes(2);
		expect(server.onOutbound.mock.calls[0][0]).toBe(PACKET.CZ.USE_ITEM.prototype.getPacketVersion()[1]);
		expect(server.onOutbound.mock.calls[1][0]).toBe(PACKET.CZ.REQ_WEAR_EQUIP.prototype.getPacketVersion()[1]);
	});

	it('reassembles a packet split across two send() calls', () => {
		const pkt = new PACKET.CZ.USE_ITEM();
		pkt.index = 9;
		const bytes = new Uint8Array(pkt.build().buffer);
		const split = Math.floor(bytes.length / 2);

		socket.send(bytes.slice(0, split).buffer);
		expect(server.onOutbound).not.toHaveBeenCalled();

		socket.send(bytes.slice(split).buffer);
		expect(server.onOutbound).toHaveBeenCalledTimes(1);

		const [, view, len] = server.onOutbound.mock.calls[0];
		expect(len).toBe(bytes.length);
		expect(view.getUint16(view.byteOffset + 2, true)).toBe(9); // index field
	});

	it('frames a variable-length chat packet by its length field', () => {
		const pkt = new PACKET.CZ.REQUEST_CHAT();
		pkt.msg = 'hello uviewer';
		const bytes = new Uint8Array(pkt.build().buffer);
		socket.send(bytes.buffer);

		expect(server.onOutbound).toHaveBeenCalledTimes(1);
		const [opcode, , len] = server.onOutbound.mock.calls[0];
		expect(opcode).toBe(PACKET.CZ.REQUEST_CHAT.prototype.getPacketVersion()[1]);
		expect(len).toBe(2 + 2 + pkt.msg.length + 1);
	});

	it('push() feeds binary data to onMessage as an ArrayBuffer copy', async () => {
		await new Promise(resolve => setTimeout(resolve, 20)); // connected
		const received = vi.fn();
		socket.onMessage = received;

		const data = new Uint8Array([0x73, 0x00, 1, 2, 3]);
		socket.push(data);

		expect(received).toHaveBeenCalledTimes(1);
		const buffer = received.mock.calls[0][0];
		expect(buffer).toBeInstanceOf(ArrayBuffer);
		expect(new Uint8Array(buffer)).toEqual(data);
		// must be a copy: mutating the source must not affect the delivery
		data[0] = 0xff;
		expect(new Uint8Array(received.mock.calls[0][0])[0]).toBe(0x73);
	});

	it('buildOutboundIndex knows the wear-equip opcode at this packetver', () => {
		const entry = server.outboundIndex.get(PACKET.CZ.REQ_WEAR_EQUIP.prototype.getPacketVersion()[1]);
		expect(entry).toBeDefined();
		expect(entry.struct).toBe(PACKET.CZ.REQ_WEAR_EQUIP);
		expect(entry.length).toBe(8); // 0x0998 row: index + u32 wearLocation
	});
});
