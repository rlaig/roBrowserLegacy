import { describe, expect, it } from 'vitest';
import StatusInfo from 'DB/Status/StatusInfo.js';
import EquipmentLocation from 'DB/Items/EquipmentLocation.js';
import ItemType from 'DB/Items/ItemType.js';
import { getProfile, getProfileNames, PROFILES } from 'Engine/UIMock/MockProfiles.js';

/**
 * Profiles feed the real UI directly: item shape must mirror the replay
 * parser's mapping, EFST ids must have icons (the StatusIcons window drops
 * unknown ones silently), and getProfile() must hand out independent copies
 * since the mock server mutates its shadow state.
 */
describe('MockProfiles', () => {
	it('exposes a default (novice) and a knight preset', () => {
		expect(getProfileNames()).toContain('novice');
		expect(getProfileNames()).toContain('knight');
	});

	it('falls back to the novice profile for unknown names', () => {
		expect(getProfile('does-not-exist').characterName).toBe(PROFILES.novice.characterName);
	});

	it('materializes items with sequential indices starting at 2 (replay parser convention)', () => {
		const profile = getProfile('knight');

		expect(profile.items.length).toBeGreaterThan(0);
		profile.items.forEach((item, slot) => {
			expect(item.index).toBe(slot + 2);
			expect(item.slotIndex).toBe(slot);
			expect(item.ITID).toBe(item.itemId);
			expect(item.count).toBeGreaterThan(0);
			expect(item.IsIdentified).toBe(true);
			expect(item.WearState).toBe(item.location);
			expect(item.slot).toBeDefined();
			expect(item.Options).toEqual([]);
		});
	});

	it('maps potions to HEALING, wings to USABLE and equipped gear to ARMOR', () => {
		const items = getProfile('knight').items;
		const byId = id => items.find(item => item.ITID === id);

		expect(byId(501).type).toBe(ItemType.HEALING);
		expect(byId(601).type).toBe(ItemType.USABLE);
		expect(byId(1102).type).toBe(ItemType.ARMOR); // equipped weapon reports ARMOR, like the replay parser
		expect(byId(1102).WearState).toBe(EquipmentLocation.WEAPON);
		expect(byId(2501).WearState).toBe(EquipmentLocation.GARMENT);
		expect(byId(1102).RefiningLevel).toBe(7);
	});

	it('carries equipped bits matching the profile definition', () => {
		const equipped = getProfile('novice').items.filter(item => item.WearState > 0);

		expect(equipped.map(item => item.WearState).sort((a, b) => a - b)).toEqual([
			EquipmentLocation.WEAPON,   // 2
			EquipmentLocation.GARMENT,  // 4
			EquipmentLocation.ARMOR,    // 16
			EquipmentLocation.SHOES     // 64
		]);
	});

	it('only lists EFSTs that have an icon in StatusInfo', () => {
		for (const name of getProfileNames()) {
			for (const efst of getProfile(name).efsts) {
				expect(StatusInfo[efst], `EFST ${efst} (${name}) has no StatusInfo entry`).toBeDefined();
				expect(StatusInfo[efst].icon).toBeTruthy();
			}
		}

		// knight shows at least the themed Two-Hand Quicken buff
		expect(getProfile('knight').efsts.length).toBeGreaterThan(0);
	});

	it('skills carry SKID + level and the knight tree includes core knight skills', () => {
		const novice = getProfile('novice');
		expect(novice.skills.length).toBe(1);
		expect(novice.skills[0].SKID).toBe(1); // NV_BASIC

		const knight = getProfile('knight');
		const skillIds = knight.skills.map(skill => skill.SKID);
		expect(skillIds).toContain(5); // SM_BASH
		expect(skillIds).toContain(60); // KN_TWOHANDQUICKEN
		expect(knight.skills.every(skill => Number.isInteger(skill.level))).toBe(true);
	});

	it('returns an independent deep copy (shadow state must not mutate presets)', () => {
		const a = getProfile('knight');
		const b = getProfile('knight');

		a.items[0].count = 0;
		a.items[0].WearState = 99;
		a.skills[0].level = 0;

		expect(b.items[0].count).toBe(PROFILES.knight.items[0].count);
		expect(b.items[0].WearState).toBe(0);
		expect(b.skills[0].level).toBe(PROFILES.knight.skills[0].level);
	});

	it('session fields match the shape _applySession() consumes', () => {
		for (const name of getProfileNames()) {
			const p = getProfile(name);

			for (const field of [
				'characterName', 'sex', 'AID', 'job', 'level', 'joblevel',
				'exp', 'exp_next', 'job_exp', 'job_exp_next',
				'str', 'agi', 'vit', 'int', 'dex', 'luk',
				'money', 'weight', 'max_weight', 'speed', 'attack_speed',
				'head', 'weapon', 'shield', 'robe',
				'hp', 'maxHp', 'sp', 'maxSp',
				'mapName', 'startX', 'startY', 'startDir'
			]) {
				expect(p[field], `${name}.${field} missing`).toBeDefined();
			}

			expect(p.mapName.endsWith('.rsw')).toBe(true);
			expect(p.startDir).toBeGreaterThanOrEqual(0);
			expect(p.startDir).toBeLessThanOrEqual(7);
		}
	});
});
