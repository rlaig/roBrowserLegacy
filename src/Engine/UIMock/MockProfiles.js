/**
 * Engine/UIMock/MockProfiles.js
 *
 * UViewer character presets.
 *
 * A profile is a plain, JSON-safe description of a logged-in character:
 * the session fields `_applySession()` consumes (see Engine/Replay/ReplayPlayer.js),
 * a compact item list, skills, EFSTs and a spawn point. `getProfile()` returns a
 * deep copy with the compact items expanded to the full inventory shape the UI
 * expects (mirrors Engine/Replay/ReplayParser.js item mapping), so the mock
 * server can keep its shadow state without ever mutating the presets.
 *
 * Item ids are the classic stable ones present in every data era (potions,
 * wings, starter gear) so the DB lookup never misses; skill ids and EFST ids
 * are curated to exist in SkillInfo / StatusInfo.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import JobId from 'DB/Jobs/JobConst.js';
import SkillId from 'DB/Skills/SkillConst.js';
import SC from 'DB/Status/StatusConst.js';
import EquipmentLocation from 'DB/Items/EquipmentLocation.js';
import ItemType from 'DB/Items/ItemType.js';

/**
 * Same heuristic ReplayParser uses to sort an item into an inventory tab
 * (Engine/Replay/ReplayParser.js ~1000-1016), applied by item id.
 *
 * @param {number} id - item id
 * @param {number} equipped - equipment bit mask (0 = not equipped)
 * @returns {number} ItemType value
 */
function itemTypeForId(id, equipped) {
	if (equipped & EquipmentLocation.AMMO) {
		return ItemType.AMMO;
	}
	if (equipped > 0) {
		return ItemType.ARMOR;
	}
	if (id >= 501 && id <= 600) {
		return ItemType.HEALING;
	}
	if (id >= 601 && id <= 700) {
		return ItemType.USABLE;
	}
	if (id >= 4001 && id <= 4700) {
		return ItemType.CARD;
	}
	if (id >= 1101 && id <= 2100) {
		return ItemType.WEAPON;
	}
	if (id >= 2101 && id <= 2999) {
		return ItemType.ARMOR;
	}
	return ItemType.ETC;
}

/**
 * Expand a compact item `{ id, count, equipped, refine }` into the full
 * inventory item shape (ReplayParser.js:1018-1052).
 *
 * @param {object} compact
 * @param {number} slot - zero-based inventory slot; index becomes slot + 2
 * @returns {object} item ready for Inventory.getUI().addItem()
 */
function materializeItem(compact, slot) {
	const equipped = compact.equipped || 0;
	const count = compact.count || 1;

	return {
		index: slot + 2,
		ITID: compact.id,
		count: count,
		type: itemTypeForId(compact.id, equipped),
		IsIdentified: true,
		IsDamaged: false,
		PlaceETCTab: false,
		WearState: equipped,
		location: equipped,
		RefiningLevel: compact.refine || 0,
		enchantgrade: compact.grade || 0,
		slot: { card1: 0, card2: 0, card3: 0, card4: 0 },
		cards: [0, 0, 0, 0],
		Options: [],
		HireExpireDate: 0,
		bindOnEquipType: 0,
		wItemSpriteNumber: 0,
		// Aliases for compatibility
		itemId: compact.id,
		qty: count,
		slotIndex: slot,
		refine: compact.refine || 0,
		grade: compact.grade || 0,
		options: []
	};
}

/**
 * Skill list entry as SkillList.getUI().setSkills() expects it.
 *
 * @param {number} SKID - skill id (must exist in SkillInfo)
 * @param {number} level - learned level (0 = shown locked in the tree)
 * @param {number} [spcost] - SP cost per cast
 */
function sk(SKID, level, spcost) {
	return {
		SKID,
		level,
		spcost: spcost || 0,
		attackRange: 1,
		type: 0,
		upgradable: false
	};
}

/**
 * Character presets.
 */
export const PROFILES = {
	novice: {
		label: 'Novice',
		characterName: 'MockNovice',
		sex: 1,
		AID: 2000001,
		job: JobId.NOVICE,
		level: 1,
		joblevel: 1,
		exp: 0,
		exp_next: 9,
		job_exp: 0,
		job_exp_next: 10,
		str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5,
		str_bonus: 0, agi_bonus: 0, vit_bonus: 0, int_bonus: 0, dex_bonus: 0, luk_bonus: 0,
		money: 1250,
		weight: 0,
		max_weight: 2000,
		speed: 150,
		attack_speed: 145,
		hp: 51, maxHp: 51,
		sp: 12, maxSp: 12,
		head: 2,
		weapon: 0, shield: 0,
		bodypalette: 0, headpalette: 0,
		accessory: 0, accessory2: 0, accessory3: 0,
		robe: 0,
		effectState: 0,
		hasCart: false,
		CartNum: 0,
		mapName: 'guild_vs4.rsw',
		startX: 50, startY: 50, startDir: 4,

		items: [
			{ id: 501, count: 12 },                              // Red Potion
			{ id: 601, count: 2 },                               // Fly Wing
			{ id: 1101, count: 1, equipped: EquipmentLocation.WEAPON },   // Knife
			{ id: 2301, count: 1, equipped: EquipmentLocation.ARMOR },    // Cotton Shirt
			{ id: 2401, count: 1, equipped: EquipmentLocation.SHOES },    // Sandals
			{ id: 2501, count: 1, equipped: EquipmentLocation.GARMENT }   // Hood
		],
		cartItems: [],
		skills: [
			sk(SkillId.NV_BASIC, 9)
		],
		skillPoints: 0,
		efsts: [],
		chatHistory: [
			'Welcome to the UViewer mock world.',
			'This session is simulated - no server is connected.'
		]
	},

	knight: {
		label: 'Knight',
		characterName: 'MockKnight',
		sex: 1,
		AID: 2000002,
		job: JobId.KNIGHT,
		level: 75,
		joblevel: 45,
		exp: 421800,
		exp_next: 1286400,
		job_exp: 96500,
		job_exp_next: 210000,
		str: 82, agi: 63, vit: 74, int: 2, dex: 54, luk: 32,
		str_bonus: 14, agi_bonus: 6, vit_bonus: 4, int_bonus: 2, dex_bonus: 8, luk_bonus: 2,
		money: 128500,
		weight: 1240,
		max_weight: 6970,
		speed: 150,
		attack_speed: 172,
		hp: 9760, maxHp: 9760,
		sp: 156, maxSp: 156,
		head: 4,
		weapon: 2, shield: 0,
		bodypalette: 0, headpalette: 0,
		accessory: 0, accessory2: 0, accessory3: 0,
		robe: 0,
		effectState: 0,
		hasCart: false,
		CartNum: 0,
		mapName: 'guild_vs4.rsw',
		startX: 50, startY: 48, startDir: 4,

		items: [
			{ id: 501, count: 50 },                              // Red Potion
			{ id: 502, count: 25 },                              // Orange Potion
			{ id: 601, count: 10 },                              // Fly Wing
			{ id: 602, count: 3 },                               // Butterfly Wing
			{ id: 1102, count: 1, equipped: EquipmentLocation.WEAPON, refine: 7 }, // Sword +7
			{ id: 2301, count: 1, equipped: EquipmentLocation.ARMOR },    // Cotton Shirt
			{ id: 2401, count: 1, equipped: EquipmentLocation.SHOES },    // Sandals
			{ id: 2501, count: 1, equipped: EquipmentLocation.GARMENT }   // Hood
		],
		cartItems: [
			{ id: 501, count: 100 }
		],
		skills: [
			sk(SkillId.NV_BASIC, 9),
			sk(SkillId.SM_BASH, 10, 8),
			sk(SkillId.SM_PROVOKE, 5, 10),
			sk(SkillId.SM_MAGNUM, 5, 30),
			sk(SkillId.SM_ENDURE, 1, 10),
			sk(SkillId.KN_SPEARMASTERY, 0),
			sk(SkillId.KN_PIERCE, 0, 7),
			sk(SkillId.KN_BRANDISHSPEAR, 0, 24),
			sk(SkillId.KN_TWOHANDQUICKEN, 10, 14),
			sk(SkillId.KN_BOWLINGBASH, 5, 14),
			sk(SkillId.KN_RIDING, 1),
			sk(SkillId.KN_CAVALIERMASTERY, 5)
		],
		skillPoints: 3,
		// Curated: every id must have an icon in StatusInfo or the UI drops it
		efsts: [
			SC.TWOHANDQUICKEN,
			SC.BLESSING,
			SC.INC_AGI
		],
		chatHistory: [
			'Welcome back, MockKnight.',
			'Buffs applied: Two-Hand Quicken, Blessing, Increase AGI.'
		]
	}
};

/**
 * Available profile names (for the control panel selector).
 *
 * @returns {string[]}
 */
export function getProfileNames() {
	return Object.keys(PROFILES);
}

/**
 * Get a working copy of a profile: deep copy with items materialized to the
 * full inventory shape and sequential inventory indices (slot + 2, matching
 * the replay parser so item ACKs line up with what the UI shows).
 *
 * Falls back to the novice profile when the name is unknown.
 *
 * @param {string} name - profile key
 * @returns {object} profile copy with `items` fully materialized
 */
export function getProfile(name) {
	const profile = PROFILES[name] || PROFILES.novice;
	const copy = JSON.parse(JSON.stringify(profile));

	copy.items = profile.items.map(materializeItem);
	copy.cartItems = (profile.cartItems || []).map(materializeItem);
	return copy;
}
