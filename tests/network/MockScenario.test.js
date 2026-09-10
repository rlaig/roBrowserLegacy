import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SC from 'DB/Status/StatusConst.js';
import MockScenario, { getScenarioEvents, SCENARIOS } from 'Engine/UIMock/MockScenario.js';

/**
 * The scenario owns a speed-aware, pausable, loopable clock and emits only
 * through the server — both properties asserted here with a fake server and
 * a pinned Date.now().
 */
describe('MockScenario', () => {
	const BASE = 1700000000000;
	let server;
	let nowSpy;

	function setNow(offsetMs) {
		nowSpy.mockReturnValue(BASE + offsetMs);
	}

	beforeEach(() => {
		server = {
			say: vi.fn(),
			announce: vi.fn(),
			setHp: vi.fn(),
			toggleEfst: vi.fn(),
			sendPacket: vi.fn(),
			sessionEntity: () => ({ life: { hp: 500, hp_max: 1000 } })
		};
		nowSpy = vi.spyOn(Date, 'now');
		setNow(0);
	});

	afterEach(() => {
		nowSpy.mockRestore();
	});

	it('resolves named, custom and disabled scenario specs', () => {
		expect(getScenarioEvents('ambient')).toEqual(SCENARIOS.ambient);
		expect(getScenarioEvents('none')).toBeNull();
		expect(getScenarioEvents(null)).toBeNull();
		expect(getScenarioEvents(undefined)).toBeNull();
		expect(getScenarioEvents('nope')).toBeNull();

		const custom = [{ t: 2000, type: 'chat', data: { text: 'b' } }, { t: 1000, type: 'chat', data: { text: 'a' } }];
		const sorted = getScenarioEvents(custom);
		expect(sorted[0].t).toBe(1000); // sorted by time
	});

	it('emits events in order as wall time advances', () => {
		const scenario = new MockScenario(server, [
			{ t: 0, type: 'announce', data: { text: 'now' } },
			{ t: 1000, type: 'chat', data: { text: 'one' } },
			{ t: 2000, type: 'chat', data: { text: 'two' } }
		]);

		scenario.start();
		scenario.tick();
		expect(server.announce).toHaveBeenCalledWith('now');
		expect(server.say).not.toHaveBeenCalled();

		setNow(1500);
		scenario.tick();
		expect(server.say).toHaveBeenCalledWith('one');
		expect(server.say).toHaveBeenCalledTimes(1);

		setNow(2500);
		scenario.tick();
		expect(server.say).toHaveBeenCalledTimes(2);
		expect(scenario.emitCount).toBe(3);
	});

	it('applies speed to the logical clock', () => {
		const scenario = new MockScenario(server, [
			{ t: 10000, type: 'chat', data: { text: 'fast' } }
		]);
		scenario.start();
		scenario.setSpeed(2);
		scenario.tick();

		setNow(6000); // 6s wall × 2 = 12s logical
		scenario.tick();
		expect(server.say).toHaveBeenCalledWith('fast');
	});

	it('freezes the timeline while paused and continues on resume', () => {
		const scenario = new MockScenario(server, [
			{ t: 5000, type: 'chat', data: { text: 'later' } }
		]);
		scenario.start();

		setNow(2000);
		scenario.pause();
		setNow(12000); // 10s paused — must not count
		scenario.tick();
		expect(server.say).not.toHaveBeenCalled();

		scenario.resume();
		setNow(13000); // 3s more of play time → 5s logical total
		scenario.tick();
		expect(server.say).toHaveBeenCalledWith('later');
	});

	it('loops back to the start once the end is reached', () => {
		const scenario = new MockScenario(server, [
			{ t: 0, type: 'chat', data: { text: 'a' } },
			{ t: 1000, type: 'chat', data: { text: 'b' } }
		], { loop: true });

		scenario.start();
		setNow(1500);
		scenario.tick();
		expect(server.say).toHaveBeenCalledTimes(2);

		// loop re-origins at t=0: another full pass replays from the timeline start
		setNow(3000);
		scenario.tick();
		expect(server.say).toHaveBeenCalledTimes(4);
		expect(scenario.emitCount).toBe(4);
	});

	it('hp delta events clamp to the entity life range', () => {
		const scenario = new MockScenario(server, [
			{ t: 0, type: 'hp', data: { delta: -0.9 } },
			{ t: 1000, type: 'hp', data: { delta: 5 } }
		]);
		scenario.start();

		scenario.tick();
		expect(server.setHp).toHaveBeenCalledWith(0); // 500 - 900 → clamped

		setNow(1500);
		scenario.tick();
		expect(server.setHp).toHaveBeenLastCalledWith(1000); // clamped to max
	});

	it('efst and packet events dispatch to the matching server call', () => {
		const raw = new Uint8Array([0x73, 0x00]);
		const scenario = new MockScenario(server, [
			{ t: 0, type: 'efst', data: { id: SC.ENERGYCOAT, on: true } },
			{ t: 0, type: 'packet', data: { pkt: raw } }
		]);
		scenario.start();
		scenario.tick();

		expect(server.toggleEfst).toHaveBeenCalledWith(SC.ENERGYCOAT, true);
		expect(server.sendPacket).toHaveBeenCalledWith(raw);
	});
});
