import { beforeEach, describe, expect, it } from 'vitest';
import BinaryReader from 'Utils/BinaryReader.js';
import PACKETVER from 'Network/PacketVerManager.js';
import PacketLength from 'Network/PacketLength.js';
import * as MockPackets from 'Engine/UIMock/MockPackets.js';

/**
 * Every builder must produce exactly the wire length the client's inbound
 * framer (NetworkManager.receive → PacketLength) expects for the configured
 * packetver, and the field order must round-trip through the same
 * BinaryReader calls the real PACKET.ZC.* parse functions use.
 */
describe('MockPackets', () => {
	const PACKETVERS = [20100628, 20101123, 20211103];

	beforeEach(() => {
		PACKETVER.value = 20211103;
	});

	describe('wire lengths match PacketLength tables', () => {
		for (const ver of PACKETVERS) {
			it(`at packetver ${ver}`, () => {
				PACKETVER.value = ver;

				expect(MockPackets.acceptEnter(50, 100, 4).length).toBe(PacketLength.getPacketLength(0x0073));
				expect(MockPackets.stateChange(1, 2000001, true).length).toBe(PacketLength.getPacketLength(0x0196));
				expect(MockPackets.notifyTime(123456).length).toBe(PacketLength.getPacketLength(0x007f));
				expect(MockPackets.useItemAck(2, 5, 1).length).toBe(PacketLength.getPacketLength(0x00a8));
				expect(MockPackets.takeoffEquipAck(2, 8).length).toBe(PacketLength.getPacketLength(0x00ac));
				expect(MockPackets.deleteItem(2, 1).length).toBe(PacketLength.getPacketLength(0x07fa));
				expect(MockPackets.wearEquipAck(2, 8, 1201).length).toBe(PacketLength.getPacketLength(0x00aa));

				// variable length: length field must match the buffer size
				const chat = MockPackets.playerChat('hello world');
				expect(chat.length).toBe(2 + 2 + 'hello world'.length + 1);
				expect(new DataView(chat.buffer).getUint16(2, true)).toBe(chat.length);
			});
		}
	});

	it('wearEquipAck omits viewid before 20101123 and includes it after', () => {
		PACKETVER.value = 20100629;
		expect(MockPackets.wearEquipAck(2, 8, 1201).length).toBe(7);

		PACKETVER.value = 20101123;
		expect(MockPackets.wearEquipAck(2, 8, 1201).length).toBe(9);
	});

	it('acceptEnter packs x/y/dir like the real parser reads them', () => {
		const pkt = MockPackets.acceptEnter(150, 200, 4);
		const fp = new BinaryReader(pkt.buffer);
		expect(fp.readUShort()).toBe(0x0073);
		fp.readULong(); // timestamp

		const p = (fp.readUChar() << 16) | (fp.readUChar() << 8) | fp.readUChar();
		expect((p >> 14) & 0x3ff).toBe(150);
		expect((p >> 4) & 0x3ff).toBe(200);
		expect(p & 0x0f).toBe(4);
	});

	it('stateChange fields round-trip (index, AID, state)', () => {
		const pkt = MockPackets.stateChange(42, 2000001, false);
		const fp = new BinaryReader(pkt.buffer);
		fp.readUShort(); // opcode
		expect(fp.readShort()).toBe(42);
		expect(fp.readULong()).toBe(2000001);
		expect(fp.readUChar()).toBe(0);
	});

	it('useItemAck fields round-trip (index, count, result)', () => {
		const pkt = MockPackets.useItemAck(3, 7, 1);
		const fp = new BinaryReader(pkt.buffer);
		fp.readUShort();
		expect(fp.readUShort()).toBe(3);
		expect(fp.readShort()).toBe(7);
		expect(fp.readUChar()).toBe(1);
	});

	it('deleteItem fields round-trip (DeleteType, Index, Count)', () => {
		const pkt = MockPackets.deleteItem(3, 1);
		const fp = new BinaryReader(pkt.buffer);
		fp.readUShort();
		expect(fp.readShort()).toBe(0);
		expect(fp.readUShort()).toBe(3);
		expect(fp.readShort()).toBe(1);
	});

	it('playerChat payload is NUL terminated and decodable', () => {
		const pkt = MockPackets.playerChat('UViewer mock');
		const fp = new BinaryReader(pkt.buffer);
		fp.readUShort();
		fp.readUShort();
		const msg = fp.readString(pkt.length - 4);
		expect(msg).toBe('UViewer mock');
	});

	it('wearEquipAck fields round-trip at 20211103 (index, wearLocation, viewid, result)', () => {
		PACKETVER.value = 20211103;
		const pkt = MockPackets.wearEquipAck(3, 34, 1201);
		const fp = new BinaryReader(pkt.buffer);
		fp.readUShort();
		expect(fp.readUShort()).toBe(3);
		expect(fp.readUShort()).toBe(34);
		expect(fp.readUShort()).toBe(1201);
		expect(fp.readUChar()).toBe(1);
	});
});
