import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1280, height: 720 } }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));

// GUIComponent._loadHeavyDeps() lazily imports these during append(); stub
// them so the Promise resolves instantly instead of outliving the test
// environment (teardown would kill the module fetch → unhandled rejection).
vi.mock('UI/CursorManager.js', () => ({ default: {} }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE: {} } }));
vi.mock('Core/Client.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));

const { default: Component } = await import('UI/Components/UViewer/UViewer.js');
const { getProfileNames } = await import('Engine/UIMock/MockProfiles.js');
const { SCENARIOS } = await import('Engine/UIMock/MockScenario.js');

describe('UViewer control panel', () => {
	beforeAll(() => {
		Component.append();
	});

	afterAll(() => {
		Component.remove?.();
	});

	function optionValues(selector) {
		return [...Component.getRoot().querySelectorAll(selector + ' option')].map(option => option.value);
	}

	it('mounts and exposes a shadow root', () => {
		const root = Component.getRoot();
		expect(root).toBeTruthy();
		expect(root.querySelector('.uviewer')).toBeTruthy();
	});

	it('lists every character profile', () => {
		expect(optionValues('.profile')).toEqual(getProfileNames());
	});

	it("lists 'none' plus every scenario", () => {
		expect(optionValues('.scenario')).toEqual(['none', ...Object.keys(SCENARIOS)]);
	});

	it('fills the map datalist hints (datalist has no .add())', () => {
		// Regression: init() used HTMLDataListElement.add(), which only exists
		// on HTMLSelectElement — threw in browsers and stalled the boot queue.
		const options = optionValues('#uviewer-maps');
		expect(options.length).toBeGreaterThanOrEqual(3);
		expect(options).toContain('prontera.rsw');
	});

	it('preselects sane defaults before any config arrives', () => {
		const root = Component.getRoot();
		expect(root.querySelector('.profile').value).toBe(getProfileNames()[0]);
		expect(root.querySelector('.scenario').value).toBe('ambient');
		expect(root.querySelector('.map').value).toBe('guild_vs4.rsw');
	});

	it('suggestConfig() preselects resolved page config', () => {
		Component.suggestConfig({ map: 'prontera.rsw', profile: 'knight', scenario: 'none' });

		const root = Component.getRoot();
		expect(root.querySelector('.profile').value).toBe('knight');
		expect(root.querySelector('.map').value).toBe('prontera.rsw');
		expect(root.querySelector('.scenario').value).toBe('none');
	});

	it('suggestConfig() skips unknown values', () => {
		const root = Component.getRoot();
		const before = root.querySelector('.profile').value;

		Component.suggestConfig({ map: 'mystery.rsw', profile: 'wizard', scenario: 'ambient' });

		// unknown profile: current selection is left untouched
		expect(root.querySelector('.profile').value).toBe(before);
		expect(root.querySelector('.map').value).toBe('mystery.rsw'); // free text
		expect(root.querySelector('.scenario').value).toBe('ambient');
	});

	it('action button reads Start before a session, Restart after', () => {
		const root = Component.getRoot();
		expect(root.querySelector('.restart').textContent).toBe('Start');

		Component.setServer({
			currentConfig: { map: 'prontera.rsw', profile: 'knight', scenario: 'ambient' },
			counters: { sent: 3, received: 5, ignored: 1 },
			scenario: null,
			state: 'LIVE',
			mapName: 'prontera.rsw'
		});

		expect(root.querySelector('.restart').textContent).toBe('Restart');
		expect(root.querySelector('.status .state').textContent).toBe('LIVE');
	});

	it('restart button reports the current selections', () => {
		const onRestart = vi.fn();
		Component.onRestart = onRestart;

		const root = Component.getRoot();
		root.querySelector('.profile').value = getProfileNames()[0];
		root.querySelector('.map').value = 'prontera.rsw';
		root.querySelector('.scenario').value = 'none';

		root.querySelector('.restart').click();

		expect(onRestart).toHaveBeenCalledWith({
			profile: getProfileNames()[0],
			map: 'prontera.rsw',
			scenario: 'none'
		});
	});
});
