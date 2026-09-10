import { beforeEach, describe, expect, it, vi } from 'vitest';

// Heavy engine/UI modules stay mocked — the test drives the outbound
// dispatch and ACK bookkeeping, not the DOM or the renderer.
vi.mock('DB/DBManager.js', () => ({
	default: {
		isLoaded: true,
		lazyInit: vi.fn(),
		getItemInfo: vi.fn(() => ({ ClassNum: 5 })),
		getWeaponViewID: vi.fn(() => 7)
	}
}));
vi.mock('Engine/MapEngine.js', () => ({ default: { init: vi.fn() } }));
vi.mock('Renderer/MapRenderer.js', () => ({ default: { loading: false, currentMap: '' } }));
vi.mock('Renderer/Entity/Player.js', () => ({
	default: class Player {
		constructor(data) {
			Object.assign(this, data);
			this.display = { name: data.name };
			this.life = {};
			this.position = [0, 0, 0];
		}
	}
}));
vi.mock('UI/Components/BasicInfo/BasicInfo.js', () => ({
	default: { getUI: () => ({ update: vi.fn() }) }
}));
vi.mock('UI/Components/WinStats/WinStats.js', () => ({ default: { getUI: () => null } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: { getUI: () => null } }));
vi.mock('UI/Components/CartItems/CartItems.js', () => ({ default: { getUI: () => null } }));
vi.mock('UI/Components/SkillList/SkillList.js', () => ({ default: { getUI: () => null } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({
	default: { addText: vi.fn(), TYPE: { INFO: 1, ANNOUNCE: 2 }, FILTER: { PUBLIC_LOG: 0 } }
}));

import 'Network/NetworkManager.js'; // side effect: attaches packet version rows
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import Session from 'Engine/SessionStorage.js';
import MockSocket, { buildOutboundIndex } from 'Engine/UIMock/MockSocket.js';
import MockServer from 'Engine/UIMock/MockServer.js';

/**
 * Requests are crafted with the client's own build() functions, sent through
 * the real framing socket, and the server's answers are asserted on the wire
 * bytes — the same road the real client travels.
 */
describe('MockServer outbound dispatch', () => {
	let server;
	let socket;
	let sent;

	function shadowItem(index, overrides = {}) {
		return Object.assign({
			index,
			ITID: 501,
			count: 3,
			type: 0,
			WearState: 0,
			location: 0,
			RefiningLevel: 0
		}, overrides);
	}

	function sentBytes() {
		return sent.mock.calls.map(([pkt]) => pkt);
	}

	beforeEach(() => {
		PACKETVER.value = 20211103;
		Session.Entity = { AID: 2000001, GID: 2000001, life: { hp: 50, hp_max: 100 } };

		server = new MockServer();
		server.outboundIndex = buildOutboundIndex();
		sent = vi.fn();
		server._send = sent;

		socket = new MockSocket('127.0.0.1', 6900, server);
		server.socket = socket;
	});

	it('answers the heartbeat ping with ZC.NOTIFY_TIME', () => {
		const ping = new PACKET.CZ.REQUEST_TIME();
		ping.clientTime = 42;
		socket.send(ping.build().buffer);

		const packets = sentBytes();
		expect(packets).toHaveLength(1);
		expect(packets[0].length).toBe(6);
		expect(new DataView(packets[0].buffer).getUint16(0, true)).toBe(0x007f);
	});

	it('answers REQUEST_TIME2 the same way', () => {
		const ping = new PACKET.CZ.REQUEST_TIME2();
		ping.clientTime = 7;
		socket.send(ping.build().buffer);

		expect(sentBytes()[0].length).toBe(6);
	});

	it('echoes chat as NOTIFY_PLAYERCHAT', () => {
		const chat = new PACKET.CZ.REQUEST_CHAT();
		chat.msg = 'hello mock world';
		socket.send(chat.build().buffer);

		const packets = sentBytes();
		expect(packets).toHaveLength(1);
		const pkt = packets[0];
		expect(new DataView(pkt.buffer).getUint16(0, true)).toBe(0x008e);
		const len = new DataView(pkt.buffer).getUint16(2, true);
		expect(len).toBe(pkt.length);
	});

	it('decrements the shadow count on CZ.USE_ITEM and ACKs the new count', () => {
		const item = shadowItem(2, { count: 3 });
		server.shadowItems.set(2, item);

		const use = new PACKET.CZ.USE_ITEM();
		use.index = 2;
		socket.send(use.build().buffer);

		const pkt = sentBytes()[0];
		const view = new DataView(pkt.buffer);
		expect(view.getUint16(0, true)).toBe(0x00a8);
		expect(view.getUint16(2, true)).toBe(2);   // index
		expect(view.getInt16(4, true)).toBe(2);    // count 3 → 2
		expect(view.getUint8(6, true)).toBe(1);    // success
		expect(item.count).toBe(2);
	});

	it('removes the slot once the count reaches zero', () => {
		server.shadowItems.set(2, shadowItem(2, { count: 1 }));

		const use = new PACKET.CZ.USE_ITEM();
		use.index = 2;
		socket.send(use.build().buffer);

		const view = new DataView(sentBytes()[0].buffer);
		expect(view.getInt16(4, true)).toBe(0);    // count 0 drops the slot in the UI
		expect(server.shadowItems.has(2)).toBe(false);
	});

	it('rejects USE_ITEM for unknown or equipped slots', () => {
		server.shadowItems.set(9, shadowItem(9, { WearState: 2, location: 2 }));

		const use = new PACKET.CZ.USE_ITEM();
		use.index = 9;
		socket.send(use.build().buffer);

		const view = new DataView(sentBytes()[0].buffer);
		expect(view.getUint8(6, true)).toBe(0);    // failure
		expect(server.shadowItems.get(9).WearState).toBe(2); // untouched

		const useUnknown = new PACKET.CZ.USE_ITEM();
		useUnknown.index = 77;
		socket.send(useUnknown.build().buffer);
		expect(new DataView(sentBytes()[1].buffer).getUint8(6, true)).toBe(0);
	});

	it('ACKs CZ.REQ_WEAR_EQUIP with the weapon view id and updates the shadow state', () => {
		server.shadowItems.set(5, shadowItem(5, { ITID: 1102, type: 5 }));

		const wear = new PACKET.CZ.REQ_WEAR_EQUIP();
		wear.index = 5;
		wear.wearLocation = 2; // WEAPON
		socket.send(wear.build().buffer);

		const view = new DataView(sentBytes()[0].buffer);
		expect(view.getUint16(0, true)).toBe(0x00aa);
		expect(view.getUint16(2, true)).toBe(5);  // index
		expect(view.getUint16(4, true)).toBe(2);  // wearLocation
		expect(view.getUint16(6, true)).toBe(7);  // viewid from DB.getWeaponViewID
		expect(view.getUint8(8, true)).toBe(1);   // success
		expect(server.shadowItems.get(5).WearState).toBe(2);
	});

	it('ACKs CZ.REQ_TAKEOFF_EQUIP with the location from the shadow state', () => {
		server.shadowItems.set(5, shadowItem(5, { WearState: 2, location: 2 }));

		const takeoff = new PACKET.CZ.REQ_TAKEOFF_EQUIP();
		takeoff.index = 5;
		socket.send(takeoff.build().buffer);

		const view = new DataView(sentBytes()[0].buffer);
		expect(view.getUint16(0, true)).toBe(0x00ac);
		expect(view.getUint16(2, true)).toBe(5);  // index
		expect(view.getUint16(4, true)).toBe(2);  // wearLocation from shadow
		expect(view.getUint8(6, true)).toBe(1);   // success
		expect(server.shadowItems.get(5).WearState).toBe(0);
	});

	it('counts known-but-unhandled packets as ignored and answers nothing', () => {
		// CZ.CONTACTNPC: framed via the static fallback table, no mock handler
		socket.send(new Uint8Array([0x90, 0x00, 1, 0, 0, 0, 1]).buffer);

		expect(sent).not.toHaveBeenCalled();
		expect(server.counters.ignored).toBe(1);
		expect(server.counters.received).toBe(1);
	});

	it('drops buffers it cannot frame without touching the server', () => {
		socket.send(new Uint8Array([0xed, 0x0f, 0x00, 0x00]).buffer);

		expect(sent).not.toHaveBeenCalled();
		expect(server.counters.ignored).toBe(0);
		expect(server.counters.received).toBe(0);
	});
});
