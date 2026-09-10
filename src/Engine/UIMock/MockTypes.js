/**
 * Engine/UIMock/MockTypes.js
 *
 * UViewer mock server Types & Constants
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import Configs from 'Core/Configs.js';

/**
 * Informational mock logging, only emitted in development builds.
 * Warnings and errors are reported unconditionally.
 *
 * @param {...*} args
 */
export function uvLog(...args) {
	if (Configs.get('development', false)) {
		console.log('%c[UViewer]', 'color:#007070', ...args);
	}
}

/**
 * States of the mock server state machine.
 */
export const MockState = {
	IDLE: 'IDLE',
	BOOTING: 'BOOTING',
	LOADING_MAP: 'LOADING_MAP',
	INJECT_INITIAL: 'INJECT_INITIAL',
	LIVE: 'LIVE',
	STOPPED: 'STOPPED'
};
