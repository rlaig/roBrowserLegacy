/**
 * UI/Components/UViewer/UViewer.js
 *
 * UViewer control panel — mock session cockpit.
 *
 * Small dev overlay next to the game HUD: pick a character profile, map and
 * scenario, restart the mock session, pause/resize the scenario timeline and
 * watch the mock server state, packet counters and event log.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import htmlText from './UViewer.html?raw';
import cssText from './UViewer.css?raw';
import Preferences from 'Core/Preferences.js';
import Renderer from 'Renderer/Renderer.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import { getProfileNames } from 'Engine/UIMock/MockProfiles.js';
import { SCENARIOS } from 'Engine/UIMock/MockScenario.js';

/**
 * Some maps known to ship with every client, offered as datalist hints.
 */
const MAP_HINTS = [
	'guild_vs4.rsw',
	'prontera.rsw',
	'izlude.rsw',
	'geffen.rsw',
	'gefilia01.rsw'
];

const PANEL_WIDTH = 330;

const Component = new GUIComponent('UViewer', cssText);

Component.render = () => htmlText;

/**
 * Restart hook — wired by App/UViewer.js to avoid a circular import.
 */
Component.onRestart = null;

/**
 * @var {MockServer|null}
 */
let _server = null;

/**
 * @var {number} counter refresh interval
 */
let _timer = 0;

/**
 * @var {object} panel position/saved state
 */
const _preferences = Preferences.get(
	'UViewer',
	{
		x: null, // null = auto (right edge)
		y: 16
	},
	1.0
);

/**
 * Build the DOM: fill selects, wire interactions.
 */
Component.init = function init() {
	const root = this.getRoot();

	this.draggable('.title');

	const profileSel = root.querySelector('.profile');
	for (const name of getProfileNames()) {
		profileSel.add(new Option(name, name), null);
	}

	const scenarioSel = root.querySelector('.scenario');
	scenarioSel.add(new Option('none', 'none'), null);
	for (const name of Object.keys(SCENARIOS)) {
		scenarioSel.add(new Option(name, name), null);
	}

	const mapInput = root.querySelector('.map');
	const list = root.querySelector('#uviewer-maps');
	for (const map of MAP_HINTS) {
		// <datalist> has no .add() — only <select> does
		list.appendChild(new Option(map));
	}

	// Defaults for pick-first mode — App/UViewer.js refines them via
	// suggestConfig() once it resolved the page config / hash.
	profileSel.value = getProfileNames()[0];
	scenarioSel.value = 'ambient';
	mapInput.value = MAP_HINTS[0];

	root.querySelector('.restart').addEventListener('click', () => {
		if (!Component.onRestart) {
			return;
		}
		Component.onRestart({
			profile: profileSel.value,
			map: mapInput.value,
			scenario: scenarioSel.value
		});
	});

	root.querySelector('.pause').addEventListener('click', () => {
		const scenario = _server?.scenario;
		if (!scenario) {
			return;
		}
		if (scenario.playing) {
			scenario.pause();
		} else {
			scenario.resume();
		}
		syncScenarioButton();
	});

	root.querySelector('.speed').addEventListener('change', event => {
		_server?.scenario?.setSpeed(parseFloat(event.target.value));
	});
};

/**
 * Position the panel (right edge by default) and start the counter refresh.
 */
Component.onAppend = function onAppend() {
	const host = this._host;
	const x = _preferences.x === null
		? Math.max(0, Renderer.width - PANEL_WIDTH - 12)
		: _preferences.x;

	host.style.left = x + 'px';
	host.style.top = Math.max(0, _preferences.y) + 'px';

	syncFromServer();
	_timer = setInterval(refresh, 1000);
	refresh();
};

Component.onRemove = function onRemove() {
	clearInterval(_timer);
	_timer = 0;
};

/**
 * Preselect the pick-first defaults (page config / hash resolution done by
 * App/UViewer.js). Values without a matching option are skipped.
 *
 * @param {object} config - { map, profile, scenario }
 */
Component.suggestConfig = function suggestConfig(config) {
	const root = this.getRoot();
	if (!root || !config) {
		return;
	}

	const profileSel = root.querySelector('.profile');
	if ([...profileSel.options].some(option => option.value === config.profile)) {
		profileSel.value = config.profile;
	}

	if (config.map) {
		root.querySelector('.map').value = config.map;
	}

	const scenarioSel = root.querySelector('.scenario');
	if (config.scenario !== undefined && [...scenarioSel.options].some(option => option.value === config.scenario)) {
		scenarioSel.value = config.scenario;
	}
};

/**
 * Point the panel at a (new) mock server.
 *
 * @param {MockServer} server
 */
Component.setServer = function setServer(server) {
	_server = server;
	syncFromServer();
	refresh();
};

/**
 * Reflect the server's config into the selectors.
 */
function syncFromServer() {
	if (!_server?.currentConfig) {
		return;
	}

	const root = Component.getRoot();
	const { map, profile, scenario } = _server.currentConfig;

	const profileSel = root.querySelector('.profile');
	if ([...profileSel.options].some(option => option.value === profile)) {
		profileSel.value = profile;
	}

	root.querySelector('.map').value = map || '';

	const scenarioSel = root.querySelector('.scenario');
	scenarioSel.value = [...scenarioSel.options].some(option => option.value === scenario)
		? scenario
		: 'ambient';
}

/**
 * State line pushed by the mock server (server.onStateChange).
 *
 * @param {string} state - MockState value
 * @param {MockServer} server
 */
Component.setStatus = function setStatus(state, server) {
	_server = server || _server;

	const root = Component.getRoot();
	if (!root || typeof root.querySelector !== 'function') {
		return; // panel never appended (uviewer.panel === false)
	}

	root.querySelector('.status .state').textContent = state;
	refresh();
};

/**
 * Append a line to the event log.
 *
 * @param {string} line
 */
Component.addLog = function addLog(line) {
	const root = Component.getRoot();
	const log = root && typeof root.querySelector === 'function' ? root.querySelector('.log') : null;
	if (!log) {
		return;
	}

	const entry = document.createElement('div');
	entry.className = 'line';
	entry.textContent = line;
	log.prepend(entry);

	while (log.children.length > 60) {
		log.removeChild(log.lastChild);
	}
};

/**
 * Refresh counters, status and scenario button label.
 */
function refresh() {
	const root = Component.getRoot();
	if (!root || typeof root.querySelector !== 'function') {
		return;
	}

	const counters = root.querySelector('.counters');
	if (_server) {
		counters.textContent =
			'sent ' + _server.counters.sent +
			' · recv ' + _server.counters.received +
			' · ignored ' + _server.counters.ignored +
			(_server.scenario ? ' · events ' + _server.scenario.emitCount : '');
		counters.classList.remove('off');
	} else {
		counters.textContent = 'no session';
		counters.classList.add('off');
	}

	if (_server) {
		root.querySelector('.status .state').textContent = _server.state;
		root.querySelector('.status .map').textContent = _server.mapName;
	}

	// The action button starts the first session, restarts the next ones
	root.querySelector('.restart').textContent = _server ? 'Restart' : 'Start';

	syncScenarioButton();
}

/**
 * Pause/resume button label follows the scenario state.
 */
function syncScenarioButton() {
	const root = Component.getRoot();
	const button = root && typeof root.querySelector === 'function' ? root.querySelector('.pause') : null;
	if (!button) {
		return;
	}

	const scenario = _server?.scenario;

	if (!scenario) {
		button.disabled = true;
		button.textContent = 'No scenario';
		return;
	}

	button.disabled = false;
	button.textContent = scenario.playing ? 'Pause' : 'Resume';
}

export default UIManager.addComponent(Component);
