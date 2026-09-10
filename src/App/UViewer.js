/**
 * App/UViewer.js
 *
 * UViewer — simulate and mock the game UI interface render.
 *
 * Boots the client exactly like the game (Thread, Renderer, client files,
 * DB, cursor) but instead of connecting to a login server it starts the
 * Engine/UIMock mock server: a full in-game HUD session (map, windows,
 * chat, inventory, skills…) driven entirely by mock data. See
 * Engine/UIMock/MockServer.js for the session pipeline.
 *
 * Standalone: a control panel is appended; the session starts when its
 * Start button is pressed (pick profile/map/scenario first — set
 * `uviewer.autostart: true` to boot immediately instead).
 * API mode: the host page drives the session with postMessage
 * {type:'init'}, {type:'load', data:{map, profile, scenario}} and
 * {type:'stop'} (same protocol as the other viewer apps).
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import Queue from 'Utils/Queue.js';
import Configs from 'Core/Configs.js';
import Client from 'Core/Client.js';
import Thread from 'Core/Thread.js';
import BGM from 'Audio/BGM.js';
import DB from 'DB/DBManager.js';
import ConsoleManager from 'Utils/ConsoleManager.js';
import Renderer from 'Renderer/Renderer.js';
import UIManager from 'UI/UIManager.js';
import Cursor from 'UI/CursorManager.js';
import Scrollbar from 'UI/Scrollbar.js';
import Background from 'UI/Background.js';
import Intro from 'UI/Components/Intro/Intro.js';
import MockServer from 'Engine/UIMock/MockServer.js';
import UViewerPanel from 'UI/Components/UViewer/UViewer.js';

/**
 * UViewer namespace
 */
const UViewer = {};

/**
 * @var {MockServer} current mock session
 */
UViewer.server = null;

/**
 * @var {boolean} boot finished, ready to start sessions
 */
UViewer.ready = false;

/**
 * @var {object|null} config received via API 'load' before boot finished
 */
UViewer.pendingConfig = null;

/**
 * Resolve the mock session config from all supported sources
 * (postMessage payload ⊕ Configs 'uviewer' ⊕ Configs 'map' ⊕ location.hash).
 *
 * @param {object} [postData] - API 'load' payload
 * @returns {object} { map, profile, scenario }
 */
UViewer.resolveConfig = function ResolveConfig(postData) {
	const cfg = Configs.get('uviewer') || {};
	const api = Configs.get('api');
	const hash = !api && location.hash.length > 1 ? location.hash.substr(1) : '';

	return {
		map: postData?.map || cfg.map || Configs.get('map') || hash || undefined,
		profile: postData?.profile || cfg.profile || 'novice',
		scenario: postData?.scenario !== undefined ? postData.scenario : (cfg.scenario !== undefined ? cfg.scenario : 'ambient')
	};
};

/**
 * Start (or restart) a mock session.
 *
 * @param {object} config - { map, profile, scenario }
 */
UViewer.start = function Start(config) {
	// Tear the previous session down completely so windows never duplicate
	if (UViewer.server) {
		UViewer.server.stop();
	}
	UIManager.removeComponents();
	UViewer.appendPanel();

	const server = new MockServer();
	server.onLog = line => UViewerPanel.addLog(line);
	server.onStateChange = state => UViewerPanel.setStatus(state, server);
	UViewer.server = server;

	UViewerPanel.setServer(server);
	server.start(config);
};

/**
 * Append the control panel unless explicitly disabled (API embeds can set
 * `uviewer: { panel: false }`).
 */
UViewer.appendPanel = function AppendPanel() {
	const cfg = Configs.get('uviewer') || {};
	if (cfg.panel === false) {
		return;
	}

	// Restart goes back through UViewer.start so windows never duplicate
	UViewerPanel.onRestart = UViewer.start;
	UViewerPanel.append();
};

/**
 * Stop the running session and free the renderer.
 */
UViewer.stop = function Stop() {
	if (UViewer.server) {
		UViewer.server.stop();
	}
};

/**
 * Boot queue (mirror of the game's, LoginEngine replaced by the mock).
 */
UViewer.init = function Init() {
	ConsoleManager.init();
	ConsoleManager.toggle();

	const q = new Queue();

	// API mode: boot autonomously (own thread worker, config-driven session),
	// the host page can still drive restarts with 'load' / 'stop' messages.
	if (Configs.get('api')) {
		q.add(function () {
			BGM.setAvailableExtensions(['mp3']);
			Thread.hook('THREAD_READY', q.next);
			Thread.init();
		});

		q.add(function () {
			Renderer.init();
			q._next();
		});

		q.add(function () {
			function onAPIMessage(event) {
				if (typeof event.data !== 'object') {
					return;
				}
				if (event.source !== window.parent && event.source !== window.opener) {
					return;
				}

				switch (event.data.type) {
					case 'load':
						if (UViewer.ready) {
							UViewer.start(UViewer.resolveConfig(event.data.data));
						} else {
							UViewer.pendingConfig = UViewer.resolveConfig(event.data.data);
						}
						event.stopPropagation();
						break;

					case 'stop':
						UViewer.stop();
						event.stopPropagation();
						break;
				}
			}

			window.addEventListener('message', onAPIMessage, false);
			q._next();
		});
	} else {
		// Waiting for the Thread to be ready
		q.add(function () {
			BGM.setAvailableExtensions(['mp3']);
			Thread.hook('THREAD_READY', q.next);
			Thread.init();
		});

		q.add(function () {
			Renderer.init();
			q._next();
		});
	}

	// Client files (Intro unless a remote client is configured)
	q.add(function () {
		Client.onFilesLoaded = count => {
			if (!Configs.get('remoteClient') && !count && !window.electronAPI?.isElectron) {
				alert('No client to initialize roBrowser');
				Intro.remove();
				Intro.append();
				return;
			}
			q._next();
		};

		if (Configs.get('skipIntro') || Configs.get('remoteClient')) {
			Client.init([]);
			return;
		}

		Intro.onFilesSubmit = files => {
			Client.onFilesLoaded = q.next;
			Client.init(files);
		};
		Intro.append();
	});

	// Databases with the loading background
	q.add(function () {
		Intro.remove();

		DB.onReady = () => q._next();
		DB.onProgress = (i, count) => {
			Background.setPercent(Math.floor((i / count) * 100));
		};
		UIManager.removeComponents();
		Background.init();
		Background.resize(Renderer.width, Renderer.height);
		Background.setImage('bgi_temp.bmp', () => {
			DB.init();
		});
	});

	q.add(function () {
		Thread.send('CLIENT_FILES_ALIAS', DB.mapalias);
		q._next();
	});

	// Cursor & scrollbars
	q.add(function () {
		Scrollbar.init();
		Cursor.init(q.next);
	});

	// Go live
	q.add(function () {
		UViewer.ready = true;
		UViewer.appendPanel();

		const cfg = Configs.get('uviewer') || {};
		const panelEnabled = cfg.panel !== false;
		// API hosts pass a full config — that is the confirmation, so sessions
		// auto-start there. Standalone: pick options first, start on the
		// panel's Start button. A hidden panel forces auto-start (nothing
		// else could ever start the session).
		const autostart = cfg.autostart !== undefined
			? !!cfg.autostart
			: Configs.get('api') || !panelEnabled;

		if (!autostart) {
			UViewerPanel.suggestConfig(UViewer.resolveConfig());
			return;
		}

		if (Configs.get('api')) {
			if (UViewer.pendingConfig) {
				const config = UViewer.pendingConfig;
				UViewer.pendingConfig = null;
				UViewer.start(config);
			} else if (Configs.get('uviewer')) {
				// config-driven session (no host handshake needed)
				UViewer.start(UViewer.resolveConfig());
			}
			return;
		}

		UViewer.start(UViewer.resolveConfig());
	});

	q.run();
};

export default UViewer.init;

UViewer.init();
