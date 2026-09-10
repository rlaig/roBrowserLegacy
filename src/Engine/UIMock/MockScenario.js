/**
 * Engine/UIMock/MockScenario.js
 *
 * UViewer scenario timeline — declarative world activity for the LIVE phase.
 *
 * A scenario is a sorted list of `{ t, type, data }` events (t in ms since
 * session start). The engine owns its clock: logical time is
 * `origin + (now - startTime) * speed`, re-origined on pause/resume/speed
 * changes (same trick as the replay player's _syncTimeOrigin) and optionally
 * looping. Events are only ever emitted through the MockServer choke point,
 * so every visible change travels the real UI paths and the panel counters
 * stay accurate.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import SC from 'DB/Status/StatusConst.js';
import { uvLog } from './MockTypes.js';

/**
 * Built-in scenarios.
 */
export const SCENARIOS = {
	ambient: [
		{ t: 4000, type: 'announce', data: { text: 'This world is simulated by UViewer.' } },
		{ t: 9000, type: 'chat', data: { text: 'The potions are on the house.' } },
		{ t: 14000, type: 'hp', data: { delta: -0.08 } },
		{ t: 20000, type: 'chat', data: { text: 'Mind the mock monsters.' } },
		{ t: 26000, type: 'efst', data: { id: SC.ENERGYCOAT, on: true } },
		{ t: 32000, type: 'hp', data: { delta: 0.12 } },
		{ t: 40000, type: 'chat', data: { text: 'Still no server in sight.' } },
		{ t: 48000, type: 'efst', data: { id: SC.ENERGYCOAT, on: false } },
		{ t: 55000, type: 'announce', data: { text: 'Looping the scenario.' } }
	]
};

/**
 * Resolve a scenario spec (name or a custom event array) to events.
 *
 * @param {string|object[]|null} spec
 * @returns {object[]|null} sorted events, or null for "none"
 */
export function getScenarioEvents(spec) {
	if (spec === null || spec === 'none' || spec === undefined || spec === '') {
		return null;
	}

	const events = Array.isArray(spec) ? spec : SCENARIOS[spec];
	if (!Array.isArray(events) || events.length === 0) {
		console.warn('[UViewer] Unknown scenario "' + spec + '", running without one.');
		return null;
	}

	return events
		.filter(event => event && typeof event.t === 'number' && event.type)
		.sort((a, b) => a.t - b.t);
}

export default class MockScenario {
	/**
	 * @param {object} server - MockServer (the only emission path)
	 * @param {object[]} events - sorted `{t, type, data}` list
	 * @param {object} [options] - { loop = true }
	 */
	constructor(server, events, options = {}) {
		this.server = server;
		this.events = events;

		this.loop = options.loop !== false;
		this.playing = false;
		this.speed = 1;

		this.startTime = 0;
		this.origin = events.length ? events[0].t : 0;
		this.pausedAt = 0;
		this.index = 0;
		this.emitCount = 0; // total emissions, survives loops
	}

	/**
	 * Start (or restart) the timeline from the beginning.
	 */
	start() {
		this.playing = true;
		this.index = 0;
		this.origin = this.events.length ? this.events[0].t : 0;
		this.startTime = Date.now();
	}

	stop() {
		this.playing = false;
	}

	pause() {
		if (this.playing) {
			this.playing = false;
			this.pausedAt = Date.now();
		}
	}

	resume() {
		if (!this.playing && this.pausedAt) {
			// shift the wall clock origin by the pause duration
			this.startTime += Date.now() - this.pausedAt;
			this.pausedAt = 0;
			this.playing = true;
		}
	}

	/**
	 * Change playback speed, keeping the logical position.
	 */
	setSpeed(mult) {
		const next = Math.max(0.1, Math.min(10, mult || 1));
		this.origin = this.currentTime(); // freeze logical time...
		this.startTime = Date.now();      // ...and rebase the clock
		this.speed = next;
	}

	/**
	 * Current logical time (ms since scenario start, speed applied).
	 */
	currentTime() {
		return this.origin + (Date.now() - this.startTime) * this.speed;
	}

	/**
	 * Called from the MockServer LIVE tick.
	 *
	 * @param {number} now - wall clock (unused; Date.now() drives the math)
	 */
	tick() {
		if (!this.playing || this.index >= this.events.length) {
			return;
		}

		const time = this.currentTime();

		while (this.index < this.events.length && this.events[this.index].t <= time) {
			const event = this.events[this.index++];
			try {
				this._emit(event);
				this.emitCount++;
			} catch (e) {
				console.error('[UViewer] scenario event failed:', event, e);
			}
		}

		// End reached
		if (this.index >= this.events.length && this.loop) {
			this.start(); // re-origin at 0 → timeline replays
		}
	}

	/**
	 * Dispatch one event through the mock server.
	 */
	_emit(event) {
		switch (event.type) {
			case 'chat':
				this.server.say(event.data.text);
				break;

			case 'announce':
				this.server.announce(event.data.text);
				break;

			case 'hp': {
				const { hp, maxHp, delta } = event.data;
				if (delta !== undefined) {
					const entity = this.server.sessionEntity();
					if (entity) {
						this.server.setHp(
							Math.max(0, Math.min(entity.life.hp_max, Math.round(entity.life.hp + entity.life.hp_max * delta)))
						);
					}
				} else {
					this.server.setHp(hp, maxHp);
				}
				break;
			}

			case 'efst':
				this.server.toggleEfst(event.data.id, event.data.on !== false);
				break;

			case 'packet':
				this.server.sendPacket(event.data.pkt);
				break;

			default:
				uvLog('scenario: unknown event type "' + event.type + '"');
		}
	}
}
