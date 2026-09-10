/**
 * Engine/UIMock/MockPackets.js
 *
 * UViewer binary server→client packet builders.
 *
 * Each builder returns a Uint8Array ready to be pushed through the mock
 * socket into NetworkManager.receive(), which parses it with the *real*
 * packet structures — so every layout here must match the corresponding
 * PACKET.ZC.* parse function in Network/PacketStructure.js and the wire
 * lengths in Network/Packets/packetsXXXX_len_main.js.
 *
 * Only classic (non-V5) opcodes are emitted: their hooks are registered
 * unconditionally by the engine, so they are valid at every packetver.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import PACKETVER from 'Network/PacketVerManager.js';
import TextEncoding from 'Utils/CodepageManager.js';

/**
 * ZC.ACCEPT_ENTER (0x0073) — 11 bytes
 * Triggers MapEngine.onConnectionAccepted → map load → full game UI mount.
 *
 * @param {number} x - spawn x
 * @param {number} y - spawn y
 * @param {number} dir - spawn direction (0-7)
 * @returns {Uint8Array}
 */
export function acceptEnter(x, y, dir) {
	const pkt = new Uint8Array(11);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x0073, true);
	view.setUint32(2, Date.now(), true);

	const p = (x << 14) | (y << 4) | (dir & 0x0f);
	view.setUint8(6, (p >> 16) & 0xff);
	view.setUint8(7, (p >> 8) & 0xff);
	view.setUint8(8, p & 0xff);

	return pkt;
}

/**
 * ZC.MSG_STATE_CHANGE (0x0196) — 9 bytes
 * Toggles an EFST status icon (StatusIcons window).
 *
 * @param {number} statusId - EFST id (must exist in StatusTable)
 * @param {number} aid - account id of the entity
 * @param {boolean} isOn - activate or remove
 * @returns {Uint8Array}
 */
export function stateChange(statusId, aid, isOn) {
	const pkt = new Uint8Array(9);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x0196, true);
	view.setInt16(2, statusId, true);
	view.setUint32(4, aid, true);
	view.setUint8(8, isOn ? 1 : 0);
	return pkt;
}

/**
 * ZC.NOTIFY_TIME (0x007f) — 6 bytes
 * Answer to the CZ.REQUEST_TIME heartbeat ping.
 *
 * @param {number} [time=Date.now()] - server time
 * @returns {Uint8Array}
 */
export function notifyTime(time) {
	const pkt = new Uint8Array(6);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x007f, true);
	view.setUint32(2, time === undefined ? Date.now() : time, true);
	return pkt;
}

/**
 * ZC.USE_ITEM_ACK (0x00a8) — 7 bytes
 * Server answer to CZ.USE_ITEM: new item count (0 removes the slot).
 *
 * @param {number} index - inventory index
 * @param {number} count - remaining count
 * @param {number} result - 1 = success
 * @returns {Uint8Array}
 */
export function useItemAck(index, count, result) {
	const pkt = new Uint8Array(7);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x00a8, true);
	view.setUint16(2, index, true);
	view.setInt16(4, count, true);
	view.setUint8(6, result);
	return pkt;
}

/**
 * ZC.REQ_WEAR_EQUIP_ACK (0x00aa) — 7/9 bytes
 * Server answer to CZ.REQ_WEAR_EQUIP (equip success).
 *
 * The viewid field boundary follows the length tables (>= 20101123), not the
 * parse function's own branch (>= 20100629): the inbound framer skips
 * PacketLength bytes, so the buffer size must match the table or the whole
 * stream desyncs between the two boundaries.
 *
 * @param {number} index - inventory index
 * @param {number} wearLocation - equipment slot
 * @param {number} viewid - sprite view id (written only for PACKETVER >= 20101123)
 * @returns {Uint8Array}
 */
export function wearEquipAck(index, wearLocation, viewid) {
	const hasView = PACKETVER.value >= 20101123;
	const pkt = new Uint8Array(hasView ? 9 : 7);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x00aa, true);
	view.setUint16(2, index, true);
	view.setUint16(4, wearLocation, true);
	if (hasView) {
		view.setUint16(6, viewid, true);
	}
	view.setUint8(hasView ? 8 : 6, 1); // result: success
	return pkt;
}

/**
 * ZC.REQ_TAKEOFF_EQUIP_ACK (0x00ac) — 7 bytes
 * Server answer to CZ.REQ_TAKEOFF_EQUIP (unequip success).
 *
 * @param {number} index - inventory index
 * @param {number} wearLocation - equipment slot
 * @returns {Uint8Array}
 */
export function takeoffEquipAck(index, wearLocation) {
	const pkt = new Uint8Array(7);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x00ac, true);
	view.setUint16(2, index, true);
	view.setUint16(4, wearLocation, true);
	view.setUint8(6, 1); // result: success
	return pkt;
}

/**
 * ZC.DELETE_ITEM_FROM_BODY (0x07fa) — 8 bytes
 * Removes `count` units of an item from the inventory window.
 *
 * @param {number} index - inventory index
 * @param {number} count - amount to remove
 * @returns {Uint8Array}
 */
export function deleteItem(index, count) {
	const pkt = new Uint8Array(8);
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x07fa, true);
	view.setInt16(2, 0, true); // DeleteType: inventory
	view.setUint16(4, index, true);
	view.setInt16(6, count, true);
	return pkt;
}

/**
 * ZC.NOTIFY_PLAYERCHAT (0x008e) — variable length
 * The player's own chat line, echoed back by the server.
 *
 * @param {string} msg - message text
 * @returns {Uint8Array}
 */
export function playerChat(msg) {
	const bytes = TextEncoding.encode(msg, 'utf-8');
	const len = 2 + 2 + bytes.length + 1; // op + length + msg + NUL
	const pkt = new Uint8Array(len); // zero-filled, NUL terminator is implicit
	const view = new DataView(pkt.buffer);
	view.setUint16(0, 0x008e, true);
	view.setUint16(2, len, true);
	pkt.set(bytes, 4);
	return pkt;
}
