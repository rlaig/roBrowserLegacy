/**
 * Engine/UIMock/MockServer.js
 *
 * UViewer mock server — orchestrator / state machine.
 *
 *   IDLE → BOOTING → LOADING_MAP → INJECT_INITIAL → LIVE → STOPPED
 *
 * Same pipeline as the replay system (Engine/Replay/ReplayPlayer.js), but a
 * standing server instead of a recorded playback: it fabricates the session,
 * connects MapEngine through a MockSocket, synthesizes the ZC.ACCEPT_ENTER
 * that mounts the full game HUD, injects the profile data via the real UI
 * APIs, then answers the client's outgoing packets (ping, chat, items,
 * equipment) so the interface is fully interactive without a real server.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import DB from 'DB/DBManager.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import TextEncoding from 'Utils/CodepageManager.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import Session from 'Engine/SessionStorage.js';
import MapEngine from 'Engine/MapEngine.js';
import Player from 'Renderer/Entity/Player.js';
import EquipmentLocation from 'DB/Items/EquipmentLocation.js';
import ItemType from 'DB/Items/ItemType.js';
import BasicInfo from 'UI/Components/BasicInfo/BasicInfo.js';
import WinStats from 'UI/Components/WinStats/WinStats.js';
import Inventory from 'UI/Components/Inventory/Inventory.js';
import CartItems from 'UI/Components/CartItems/CartItems.js';
import SkillList from 'UI/Components/SkillList/SkillList.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import MockSocket, { buildOutboundIndex } from './MockSocket.js';
import * as MockPackets from './MockPackets.js';
import { getProfile } from './MockProfiles.js';
import MockScenario, { getScenarioEvents } from './MockScenario.js';
import { MockState, uvLog } from './MockTypes.js';

/**
 * How long to wait for the map to finish loading before giving up (ms).
 */
const MAP_LOAD_TIMEOUT = 90000;

export default class MockServer {
	constructor() {
		this.state = MockState.IDLE;

		this.socket = null;
		this.outboundIndex = null;
		this.profile = null;
		this.mapName = 'guild_vs4.rsw';

		// Authoritative item state for ACKs (index → item copy)
		this.shadowItems = new Map();

		// Wired by MockScenario (LIVE phase); kept nullable so the server
		// also runs standalone.
		this.scenario = null;
		this._scenarioSpec = 'ambient';

		// Panel hooks
		this.onLog = null;
		this.onStateChange = null;
		this.counters = { sent: 0, received: 0, ignored: 0 };

		this._onTick = this.tick.bind(this);
		this._animate = false;
		this._acceptEnterSent = false;
		this._mapLoadStarted = false;
		this._loadDeadline = 0;
	}

	/**
	 * Boot the mock session. Safe to call again while running: the previous
	 * session is torn down first.
	 *
	 * @param {object} [config] - { map, profile }
	 */
	async start(config = {}) {
		if (this.state === MockState.BOOTING || this.state === MockState.LOADING_MAP) {
			return;
		}
		if (this.socket) {
			this.stop();
		}

		this.profile = getProfile(config.profile);
		this.mapName = normalizeMapName(config.map || this.profile.mapName);
		this._scenarioSpec = config.scenario === undefined ? 'ambient' : config.scenario;
		this.scenario = null;
		this.currentConfig = {
			map: this.mapName,
			profile: config.profile || 'novice',
			scenario: this._scenarioSpec
		};
		this.counters = { sent: 0, received: 0, ignored: 0 };

		this._setState(MockState.BOOTING);
		this._log(`booting — profile "${this.profile.characterName}", map ${this.mapName}`);

		const ready = await this._waitForDB();
		if (!ready) {
			console.error('[UViewer] Failed loading databases, aborting.');
			this._setState(MockState.STOPPED);
			return;
		}

		this.outboundIndex = buildOutboundIndex();

		// Install the mock socket, then apply the profile BEFORE MapEngine.init
		// so the map name and character are already in place.
		Network.setSocketFactory((host, port) => {
			this.socket = new MockSocket(host, port, this);
			return this.socket;
		});
		Network.close();

		this._applyProfile();
	}

	/**
	 * Tear the session down. Network.close() runs before the socket reference
	 * is dropped so no disconnect error box pops up (replay ordering).
	 */
	stop() {
		this._animate = false;

		if (this.scenario) {
			this.scenario.stop();
			this.scenario = null;
		}

		Network.setSocketFactory(null);

		if (this.socket) {
			Network.close();
			this.socket = null;
		}

		this._setState(MockState.STOPPED);
	}

	/**
	 * Resolve the item view id used in ZC.REQ_WEAR_EQUIP_ACK.
	 *
	 * @param {object} item - shadow item
	 * @param {number} wearLocation
	 * @returns {number}
	 */
	_viewIdFor(item, wearLocation) {
		if (wearLocation & EquipmentLocation.WEAPON) {
			return DB.getWeaponViewID(item.ITID);
		}

		const info = DB.getItemInfo(item.ITID);
		return info?.ClassNum || 0;
	}

	/**
	 * Wait until the DB is loaded, triggering the lazy init on the way
	 * (same gate & retry budget as the replay player).
	 *
	 * @returns {Promise<boolean>} true when the DB is ready
	 */
	_waitForDB() {
		return new Promise(resolve => {
			if (DB.isLoaded) {
				resolve(true);
				return;
			}

			if (!DB.startedLazyInit) {
				DB.lazyInit();
				DB.startedLazyInit = true;
			}

			let tries = 0;
			const poll = setInterval(() => {
				if (DB.isLoaded) {
					clearInterval(poll);
					DB.startedLazyInit = false;
					resolve(true);
				} else if (++tries > 600) {
					clearInterval(poll);
					DB.startedLazyInit = false;
					resolve(false);
				}
			}, 100);
		});
	}

	/**
	 * Apply the profile to Session / Session.Entity (adapted from the replay
	 * player's _applySession, which is the proven field mapping) and enter the
	 * map loading phase.
	 */
	_applyProfile() {
		const s = this.profile;
		const charName = s.characterName || 'Mock';
		const sex = s.sex === 0 || s.sex === 1 ? s.sex : 0;
		const aid = s.AID || 0;
		const gid = s.GID || aid;

		const initData = {
			name: charName,
			sex,
			job: s.job !== undefined ? s.job : 0,
			clevel: s.level !== undefined ? s.level : s.clevel || 1,
			joblevel: s.joblevel !== undefined ? s.joblevel : 1,
			exp: s.exp || 0,
			exp_next: s.exp_next || 0,
			job_exp: s.job_exp || 0,
			job_exp_next: s.job_exp_next || 0,
			str: s.str || 1,
			agi: s.agi || 1,
			vit: s.vit || 1,
			int: s.int || 1,
			dex: s.dex || 1,
			luk: s.luk || 1,
			str_bonus: s.str_bonus || 0,
			agi_bonus: s.agi_bonus || 0,
			vit_bonus: s.vit_bonus || 0,
			int_bonus: s.int_bonus || 0,
			dex_bonus: s.dex_bonus || 0,
			luk_bonus: s.luk_bonus || 0,
			money: s.money || 0,
			weight: s.weight || 0,
			max_weight: s.max_weight || 0,
			speed: s.speed || 150,
			attack_speed: s.attack_speed || s.aspd || 300,
			head: s.head || 0,
			weapon: s.weapon || 0,
			shield: s.shield || 0,
			bodypalette: s.bodypalette || 0,
			headpalette: s.headpalette || 0,
			accessory: s.accessory || 0,
			accessory2: s.accessory2 || 0,
			accessory3: s.accessory3 || 0,
			robe: s.robe || 0,
			AID: aid,
			GID: gid
		};

		// Session globals
		Session.AID = aid;
		Session.GID = gid;
		Session.Sex = sex;
		Session.zeny = s.money || 0;
		Session.hasCart = s.hasCart || false;
		Session.CartNum = s.CartNum || 0;
		Session.petId = 0;
		Session.pet = {};

		// Player entity
		const entity = new Player(initData);
		entity.display.name = charName;
		entity._sex = sex;
		entity._job = initData.job;
		entity.clevel = initData.clevel;
		entity.level = initData.clevel;
		entity.joblevel = initData.joblevel;
		entity.money = initData.money;
		entity.weight = initData.weight;
		entity.max_weight = initData.max_weight;
		entity.speed = initData.speed;
		entity.attack_speed = initData.attack_speed;

		entity.str = initData.str;
		entity.agi = initData.agi;
		entity.vit = initData.vit;
		entity.int = initData.int;
		entity.dex = initData.dex;
		entity.luk = initData.luk;
		entity.str_bonus = initData.str_bonus;
		entity.agi_bonus = initData.agi_bonus;
		entity.vit_bonus = initData.vit_bonus;
		entity.int_bonus = initData.int_bonus;
		entity.dex_bonus = initData.dex_bonus;
		entity.luk_bonus = initData.luk_bonus;

		entity._head = initData.head;
		entity._headpalette = initData.headpalette;
		entity._bodypalette = initData.bodypalette;
		entity._weapon = initData.weapon;
		entity._shield = initData.shield;
		entity._accessory = initData.accessory;
		entity._accessory2 = initData.accessory2;
		entity._accessory3 = initData.accessory3;
		entity.robe = initData.robe;

		entity.life.hp = s.hp !== undefined ? s.hp : s.maxHp !== undefined ? s.maxHp : 100;
		entity.life.hp_max = s.maxHp !== undefined ? s.maxHp : entity.life.hp;
		entity.life.sp = s.sp !== undefined ? s.sp : s.maxSp !== undefined ? s.maxSp : 100;
		entity.life.sp_max = s.maxSp !== undefined ? s.maxSp : entity.life.sp;

		const option = s.effectState !== undefined ? s.effectState : s.option || 0;
		entity.effectState = option;
		entity._effectState = option;
		entity.option = option;

		entity.hasCart = Session.hasCart;
		entity.CartNum = Session.CartNum;

		entity.position[0] = s.startX || 0;
		entity.position[1] = s.startY || 0;
		entity.position[2] = 0;
		entity.direction = s.startDir !== undefined ? s.startDir : 4;

		Session.Entity = entity;

		// CZ.ENTER reads it (MapEngine.init); already 0 by default, keep explicit
		Session.AuthCode = Session.AuthCode || 0;

		// Shadow item state (UI objects stay untouched by ACK bookkeeping)
		this.shadowItems.clear();
		for (const item of this.profile.items) {
			this.shadowItems.set(item.index, JSON.parse(JSON.stringify(item)));
		}

		this._loadMap();
	}

	/**
	 * Enter the map loading phase: MapEngine.init "connects" through the mock
	 * socket and the tick loop takes over.
	 */
	_loadMap() {
		this._setState(MockState.LOADING_MAP);
		this._acceptEnterSent = false;
		this._mapLoadStarted = false;
		this._loadDeadline = Date.now() + MAP_LOAD_TIMEOUT;

		MapEngine.init('127.0.0.1', 6900, this.mapName);

		this._animate = true;
		this._onTick();
	}

	/**
	 * Main loop (requestAnimationFrame): drives ACCEPT_ENTER, watches the map
	 * load and keeps the scenario ticking while LIVE.
	 */
	tick() {
		if (this._animate) {
			requestAnimationFrame(this._onTick);
		}

		if (!this.socket || !this.socket.connected) {
			return;
		}

		switch (this.state) {
			case MockState.LOADING_MAP:
				// Step 1: send ACCEPT_ENTER once the socket is connected. Forcing
				// currentMap empty avoids the local teleport fast-path so the
				// renderer toggles its `loading` flag.
				if (!this._acceptEnterSent) {
					MapRenderer.currentMap = '';
					this._send(MockPackets.acceptEnter(
						this.profile.startX,
						this.profile.startY,
						this.profile.startDir
					));
					this._acceptEnterSent = true;
				}

				// Step 2/3: loading went true then false → map is in
				if (MapRenderer.loading) {
					this._mapLoadStarted = true;
				}
				if (this._mapLoadStarted && !MapRenderer.loading) {
					this._mapLoadStarted = false;
					this._setState(MockState.INJECT_INITIAL);
				}

				if (Date.now() > this._loadDeadline) {
					console.error('[UViewer] Map failed to load within the timeout.');
					this._log('map load timed out');
					this.stop();
				}
				break;

			case MockState.INJECT_INITIAL:
				this._injectInitialData();
				this._setState(MockState.LIVE);
				this._startScenario();
				break;

			case MockState.LIVE:
				if (this.scenario) {
					this.scenario.tick(Date.now());
				}
				break;
		}
	}

	/**
	 * Push the profile data into the real UI components (same calls the
	 * replay player proved): EFST icons via binary packets, bulk data via the
	 * public component APIs.
	 */
	_injectInitialData() {
		const entity = Session.Entity;

		// Buff icons through the real packet path
		for (const efst of this.profile.efsts) {
			this._send(MockPackets.stateChange(efst, entity.AID, true));
		}

		// Inventory / cart
		const inventoryUI = Inventory?.getUI ? Inventory.getUI() : null;
		if (inventoryUI && typeof inventoryUI.addItem === 'function') {
			if (inventoryUI.list) {
				inventoryUI.list.length = 0;
			}
			if (inventoryUI.equippedItems) {
				inventoryUI.equippedItems.length = 0;
			}

			for (const item of this.profile.items) {
				inventoryUI.addItem(item);
			}
		}

		const cartUI = CartItems?.getUI ? CartItems.getUI() : null;
		if (cartUI && typeof cartUI.addItem === 'function') {
			if (cartUI.list) {
				cartUI.list.length = 0;
			}
			for (const item of this.profile.cartItems || []) {
				cartUI.addItem(item);
			}
		}

		// Skills — the tree layout derives from Session.Entity._job, so the
		// session must be applied first (it is: _applyProfile ran at BOOTING)
		const skillUI = SkillList?.getUI ? SkillList.getUI() : null;
		if (skillUI) {
			if (typeof skillUI.setSkills === 'function') {
				skillUI.setSkills(this.profile.skills);
			}
			if (typeof skillUI.setPoints === 'function') {
				skillUI.setPoints(this.profile.skillPoints || 0);
			}
		}

		// Character window
		if (BasicInfo?.getUI()?.update) {
			BasicInfo.getUI().update('blvl', entity.clevel);
			BasicInfo.getUI().update('jlvl', entity.joblevel);
			BasicInfo.getUI().update('zeny', entity.money);
			BasicInfo.getUI().update('name', entity.display.name);
			BasicInfo.getUI().update('job', entity.job);
			BasicInfo.getUI().update('hp', entity.life.hp, entity.life.hp_max);
			BasicInfo.getUI().update('sp', entity.life.sp, entity.life.sp_max);
			BasicInfo.getUI().update('weight', entity.weight, entity.max_weight);
		}

		// Stats window
		if (WinStats?.getUI()?.update) {
			WinStats.getUI().update('str', entity.str);
			WinStats.getUI().update('agi', entity.agi);
			WinStats.getUI().update('vit', entity.vit);
			WinStats.getUI().update('int', entity.int);
			WinStats.getUI().update('dex', entity.dex);
			WinStats.getUI().update('luk', entity.luk);
			WinStats.getUI().update('str2', entity.str_bonus);
			WinStats.getUI().update('agi2', entity.agi_bonus);
			WinStats.getUI().update('vit2', entity.vit_bonus);
			WinStats.getUI().update('int2', entity.int_bonus);
			WinStats.getUI().update('dex2', entity.dex_bonus);
			WinStats.getUI().update('luk2', entity.luk_bonus);
		}

		// Chatbox history
		for (const line of this.profile.chatHistory || []) {
			ChatBox.addText(line, ChatBox.TYPE.INFO, ChatBox.FILTER.PUBLIC_LOG);
		}

		uvLog('initial data injected — mock session is live');
	}

	/**
	 * MockSocket entry point: one framed client→server packet.
	 *
	 * @param {number} opcode
	 * @param {DataView} view - view over exactly this packet
	 * @param {number} len - packet length in bytes
	 */
	onOutbound(opcode, view, len) {
		this.counters.received++;
		const entry = this.outboundIndex.get(opcode);
		const struct = entry?.struct;

		// Heartbeat — MapEngine hooks ZC.NOTIFY_TIME itself, answering keeps
		// the "did not answer PING" warning away.
		if (struct === PACKET.CZ.REQUEST_TIME || struct === PACKET.CZ.REQUEST_TIME2) {
			this._send(MockPackets.notifyTime(Date.now()));
			return;
		}

		if (struct === PACKET.CZ.REQUEST_CHAT) {
			this._onChat(view, len, entry);
			return;
		}

		if (struct === PACKET.CZ.USE_ITEM) {
			this._onUseItem(view, entry);
			return;
		}

		if (struct === PACKET.CZ.REQ_WEAR_EQUIP) {
			this._onWearEquip(view, entry);
			return;
		}

		if (struct === PACKET.CZ.REQ_TAKEOFF_EQUIP) {
			this._onTakeoffEquip(view, entry);
			return;
		}

		this.counters.ignored++;
		this._log('ignored ' + (struct ? packetName(struct) : '0x' + opcode.toString(16)));
	}

	/**
	 * CZ.REQUEST_CHAT → echo back as NOTIFY_PLAYERCHAT so the real render
	 * path styles it as the player's own line.
	 */
	_onChat(view, len, entry) {
		const msgAt = entry.offsets[1] !== undefined ? entry.offsets[1] : 4;
		// length field counts the trailing NUL
		const bytes = new Uint8Array(view.buffer, view.byteOffset + msgAt, len - msgAt - 1);
		const msg = TextEncoding.decode(bytes, 'utf-8');

		this._send(MockPackets.playerChat(msg));
	}

	/**
	 * CZ.USE_ITEM → decrement shadow count, answer with USE_ITEM_ACK
	 * (count 0 makes the UI drop the slot). Healing items top the HP bar up.
	 */
	_onUseItem(view, entry) {
		const index = view.getUint16(view.byteOffset + entry.offsets[0], true);
		const item = this.shadowItems.get(index);

		if (!item || item.WearState > 0) {
			this._send(MockPackets.useItemAck(index, 0, 0)); // cannot use
			return;
		}

		item.count--;

		if (item.count > 0) {
			this._send(MockPackets.useItemAck(index, item.count, 1));
		} else {
			// count 0 removes the slot in Inventory.updateItem
			this.shadowItems.delete(index);
			this._send(MockPackets.useItemAck(index, 0, 1));
		}

		// Potions heal a little so the HP bar visibly reacts
		if (item.type === ItemType.HEALING && Session.Entity) {
			const entity = Session.Entity;
			entity.life.hp = Math.min(entity.life.hp_max, entity.life.hp + 45 + (item.ITID - 501) * 30);
			BasicInfo?.getUI()?.update?.('hp', entity.life.hp, entity.life.hp_max);
		}
	}

	/**
	 * CZ.REQ_WEAR_EQUIP → equip success ACK with the item's view id.
	 */
	_onWearEquip(view, entry) {
		const index = view.getUint16(view.byteOffset + entry.offsets[0], true);
		const is32 = PACKETVER.value >= 20120925;
		const wearLocation = is32
			? view.getUint32(view.byteOffset + entry.offsets[1], true)
			: view.getUint16(view.byteOffset + entry.offsets[1], true);

		const item = this.shadowItems.get(index);
		if (!item) {
			this._send(MockPackets.wearEquipAck(index, wearLocation, 0));
			return;
		}

		item.WearState = wearLocation;
		item.location = wearLocation;
		this._send(MockPackets.wearEquipAck(index, wearLocation, this._viewIdFor(item, wearLocation)));
	}

	/**
	 * CZ.REQ_TAKEOFF_EQUIP → unequip success ACK; the equipment location
	 * comes from the shadow state (the request only carries the index).
	 */
	_onTakeoffEquip(view, entry) {
		const index = view.getUint16(view.byteOffset + entry.offsets[0], true);
		const item = this.shadowItems.get(index);
		const wearLocation = item ? item.WearState : 0;

		if (item) {
			item.WearState = 0;
			item.location = 0;
		}

		this._send(MockPackets.takeoffEquipAck(index, wearLocation));
	}

	/**
	 * Build and start the scenario once the session is LIVE.
	 */
	_startScenario() {
		const events = getScenarioEvents(this._scenarioSpec);
		if (!events) {
			return;
		}

		this.scenario = new MockScenario(this, events, { loop: true });
		this.scenario.start();
		this._log('scenario "' + (typeof this._scenarioSpec === 'string' ? this._scenarioSpec : 'custom') + '" started');
	}

	/**
	 * Convenience accessor for the scenario engine.
	 */
	sessionEntity() {
		return Session.Entity;
	}

	/**
	 * Push a server→client packet into the real receive pipeline.
	 *
	 * @param {Uint8Array} pkt
	 */
	_send(pkt) {
		if (!this.socket) {
			return;
		}
		this.counters.sent++;
		this.socket.push(pkt);
	}

	/**
	 * Scenario-facing helpers (so the timeline can drive the same real paths
	 * the interactive handlers use).
	 */
	sendPacket(pkt) {
		this._send(pkt);
	}

	say(text) {
		this._send(MockPackets.playerChat(text));
	}

	announce(text) {
		ChatBox.addText(text, ChatBox.TYPE.ANNOUNCE, ChatBox.FILTER.PUBLIC_LOG);
	}

	setHp(hp, maxHp) {
		const entity = Session.Entity;
		if (!entity) {
			return;
		}
		entity.life.hp = hp;
		if (maxHp !== undefined) {
			entity.life.hp_max = maxHp;
		}
		BasicInfo?.getUI()?.update?.('hp', entity.life.hp, entity.life.hp_max);
	}

	toggleEfst(statusId, isOn) {
		if (!Session.Entity) {
			return;
		}
		this._send(MockPackets.stateChange(statusId, Session.Entity.AID, isOn));
	}

	_setState(state) {
		this.state = state;
		if (this.onStateChange) {
			this.onStateChange(state, this);
		}
	}

	_log(text) {
		uvLog(text);
		if (this.onLog) {
			this.onLog(text, this);
		}
	}
}

/**
 * "PACKET_CZ_USE_ITEM" → "CZ.USE_ITEM"
 */
function packetName(struct) {
	return (struct.name || '').replace(/^PACKET_/, '').replace(/^([A-Z]+?)_/, '$1.');
}

/**
 * Accept "prontera", "prontera.rsw", "maps/prontera" → "prontera.rsw"
 */
function normalizeMapName(map) {
	let name = String(map || 'guild_vs4').trim();
	name = name.split(/[\\/]/).pop();        // strip any path prefix
	name = name.replace(/\.(rsw|gnd|gat)$/i, ''); // strip known extensions
	if (!name) {
		return 'guild_vs4.rsw';
	}
	return name + '.rsw';
}
