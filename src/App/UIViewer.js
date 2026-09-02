/**
 * App/UIViewer.js
 *
 * UI Component Viewer for testing and debugging UI components
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Generated for UI Testing
 */

// Add spinner before starting the require chain to let the user know things are happening in the background
window.roInitSpinner = {
	add: function(){
		// Loading spinner ring
		var loading = document.createElement('div');
		loading.id = 'loading-element';
		loading.className = 'lds-dual-ring';
		
		var loadingStyle = document.createElement('style');
		loadingStyle.id = 'loading-style';
		loadingStyle.textContent = `
			.lds-dual-ring { color: #1c4c5b }
			.lds-dual-ring,
			.lds-dual-ring:after { box-sizing: border-box; }
			.lds-dual-ring {
				position: absolute;
				display: inline-block;
				width: 80px;
				height: 80px;
				top: 50%;
				left: 50%;
				margin-top: -40px;
				margin-left: -40px;
			}
			.lds-dual-ring:after {
				content: " ";
				display: block;
				width: 64px;
				height: 64px;
				margin: 8px;
				border-radius: 50%;
				border: 6.4px solid currentColor;
				border-color: currentColor transparent currentColor transparent;
				animation: lds-dual-ring 1.2s linear infinite;
			}
			@keyframes lds-dual-ring {
				0% { transform: rotate(0deg); }
				100% { transform: rotate(360deg); }
			}
		`;
		
		// roBrowser will append all the css in the first style tag in the DOM, 
		// so we add a style tag before our own to avoid removing every style altogether,
		// when we remove the spinner later.
		document.head.appendChild(document.createElement('style'));
		// We also need to store a direct reference, because iframe messes with document
		window.roInitSpinner.styleElem = document.head.appendChild(loadingStyle);
		window.roInitSpinner.divElem = document.body.appendChild(loading);
	},
	remove: function(){
		window.roInitSpinner.styleElem?.remove();
		window.roInitSpinner.divElem?.remove();
	}
};

// Add spinner before starting the require chain
window.roInitSpinner.add();

// Errors Handler (hack)
require.onError = function (err) {
	'use strict';

	if (require.defined('UI/Components/Error/Error')) {
		require('UI/Components/Error/Error').addTrace(err);
		return;
	}

	require(['UI/Components/Error/Error'], function( Errors ){
		Errors.addTrace(err);
	});
};

require( {
	baseUrl: '../../src/',
	paths: {
		text:   'Vendors/text.require',
		jquery: 'Vendors/jquery-1.9.1'
	}
},
	['Core/Thread', 'Core/Client', 'Core/Configs', 'Utils/jquery', 'UI/UIManager', 
	 'DB/DBManager', 'Engine/SessionStorage', 'Renderer/Renderer',
	 'Preferences/Map', 'Preferences/Controls', 'Core/Preferences',
	 'Network/PacketVerManager', 'Controls/KeyEventHandler',
	 'Network/NetworkManager', 'Network/PacketStructure',
	 'DB/Items/ItemType', 'Controls/MouseEventHandler',
	 'Renderer/SpriteRenderer', 'Core/Context', 'Core/Events',
	 // Pre-load commonly used UI components to prevent cross-dependency errors
	 'UI/Components/Emoticons/Emoticons',
	 'UI/Components/ItemInfo/ItemInfo',
	 'UI/Components/WinPopup/WinPopup',
	 'UI/Components/ContextMenu/ContextMenu',
	 'UI/Components/ItemCompare/ItemCompare',
	 'UI/Components/Escape/Escape',
	 'UI/Components/InputBox/InputBox'],
	function(Thread, Client, Configs, $, UIManager, 
	         DB, Session, Renderer,
	         MapPrefs, ControlPrefs, Preferences,
	         PACKETVER, KEYS,
	         Network, PACKET,
	         ItemType, Mouse,
	         SpriteRenderer, Context, Events,
	         // Pre-loaded UI components
	         Emoticons, ItemInfo, WinPopup, ContextMenu, ItemCompare, Escape, InputBox) {
		'use strict';

		/**
		 * UIViewer namespace
		 */
		var UIViewer = {};

		/**
		 * Available UI Components to test
		 */
		UIViewer.components = [
			'BasicInfo',
			'ChatBox',
			'Inventory',
			'Equipment',
			'MiniMap',
			'ShortCut',
			'StatusIcons',
			'FPS',
			'InputBox',
			'WinPopup',
			'WinPrompt',
			'ContextMenu',
			'Emoticons',
			'WinStats',
			'ItemInfo',
			'SkillList',
			'Quest',
			'Mail',
			'Guild',
			'Trade',
			'Storage',
			'CartItems',
			'CharSelect',
			'CharCreate',
			'WinLogin',
			'Announce',
			'Bank',
			'CashShop',
			'CheckAttendance',
			'GraphicsOption',
			'SoundOption'
		];

		/**
		 * Track which components are currently active (visible)
		 */
		UIViewer.activeComponents = {};

		/**
		 * Initialize UIViewer
		 */
		UIViewer.init = function Init() {
			// Remove loading spinner
			window.roInitSpinner.remove();

			// Initialize basic systems that UI components expect
			UIViewer.initializeSystems();

			// Create UI Viewer interface
			UIViewer.createInterface();

			// Initialize Thread and Client
			if (Configs.get('API')) {
				Thread.delegate(window.parent, '*');
			}
			
			Thread.hook('THREAD_READY', function(){
				Client.onFilesLoaded = function(){
					console.log('UIViewer: Client files loaded');
					// Initialize DB after client files are loaded
					DB.init();
				};
				Client.init([]);
			});
			Thread.init();
		};

		/**
		 * Initialize basic systems required by UI components
		 */
		UIViewer.initializeSystems = function InitializeSystems() {
			// Initialize basic session data that components might expect
			if (!Session.Entity) {
				Session.Entity = {
					position: [0, 0, 0],
					direction: 0,
					hp: 100,
					hp_max: 100,
					sp: 100,
					sp_max: 100,
					base_level: 1,
					job_level: 1,
					zeny: 0
				};
			}

			// Initialize basic character data if not present
			if (!Session.character) {
				Session.character = {
					name: 'UIViewer',
					job: 0,
					sex: 0
				};
			}

			// Initialize renderer if not already done
			if (!Renderer.canvas) {
				try {
					Renderer.init();
				} catch (e) {
					console.warn('UIViewer: Could not initialize Renderer:', e.message);
				}
			}

			// Set up basic preferences that components might need
			try {
				if (typeof Preferences.init === 'function') {
					Preferences.init();
				}
			} catch (e) {
				console.warn('UIViewer: Could not initialize Preferences:', e.message);
			}

			// Initialize packet version manager
			try {
				if (!PACKETVER.value) {
					PACKETVER.value = 20230621; // Set a default packet version
				}
			} catch (e) {
				console.warn('UIViewer: Could not initialize PACKETVER:', e.message);
			}

			// Initialize pre-loaded components to ensure they're available
			try {
				UIViewer.initializePreloadedComponents();
			} catch (e) {
				console.warn('UIViewer: Could not initialize pre-loaded components:', e.message);
			}

			console.log('UIViewer: Basic systems initialized');
		};

		/**
		 * Initialize pre-loaded UI components
		 */
		UIViewer.initializePreloadedComponents = function InitializePreloadedComponents() {
			var preloadedComponents = [
				{ name: 'Emoticons', component: Emoticons },
				{ name: 'ItemInfo', component: ItemInfo },
				{ name: 'WinPopup', component: WinPopup },
				{ name: 'ContextMenu', component: ContextMenu },
				{ name: 'ItemCompare', component: ItemCompare },
				{ name: 'Escape', component: Escape },
				{ name: 'InputBox', component: InputBox }
			];

			preloadedComponents.forEach(function(item) {
				try {
					// Ensure component is prepared but not appended
					if (item.component && typeof item.component.prepare === 'function') {
						item.component.prepare();
					}
					console.log('UIViewer: Pre-loaded component:', item.name);
				} catch (e) {
					console.warn('UIViewer: Failed to prepare pre-loaded component ' + item.name + ':', e.message);
				}
			});
		};

		/**
		 * Create the UI Viewer interface
		 */
		UIViewer.createInterface = function CreateInterface() {
			// Create main container
			var container = $('<div id="uiviewer-container"></div>');
			container.css({
				position: 'fixed',
				top: '10px',
				right: '10px',
				width: '300px',
				maxHeight: '80vh',
				background: 'rgba(0, 0, 0, 0.9)',
				border: '2px solid #444',
				borderRadius: '8px',
				padding: '15px',
				zIndex: 10000,
				color: 'white',
				fontFamily: 'Arial, sans-serif',
				fontSize: '12px',
				overflow: 'auto'
			});

			// Add title
			var title = $('<h2>UI Component Viewer</h2>');
			title.css({
				margin: '0 0 15px 0',
				color: '#4CAF50',
				fontSize: '16px',
				textAlign: 'center'
			});
			container.append(title);

			// Add toggle all buttons
			var buttonContainer = $('<div></div>');
			buttonContainer.css({
				marginBottom: '15px',
				textAlign: 'center'
			});

			var showAllBtn = $('<button>Show All</button>');
			var hideAllBtn = $('<button>Hide All</button>');
			
			[showAllBtn, hideAllBtn].forEach(function(btn) {
				btn.css({
					background: '#4CAF50',
					color: 'white',
					border: 'none',
					padding: '5px 10px',
					margin: '0 5px',
					borderRadius: '3px',
					cursor: 'pointer',
					fontSize: '11px'
				});
			});

			showAllBtn.click(function() {
				UIViewer.components.forEach(function(componentName) {
					UIViewer.toggleComponent(componentName, true);
				});
			});

			hideAllBtn.click(function() {
				UIViewer.components.forEach(function(componentName) {
					UIViewer.toggleComponent(componentName, false);
				});
			});

			// Add clear all button for complete cleanup
			var clearAllBtn = $('<button>Clear All</button>');
			clearAllBtn.css({
				background: '#f44336',
				color: 'white',
				border: 'none',
				padding: '5px 10px',
				margin: '0 5px',
				borderRadius: '3px',
				cursor: 'pointer',
				fontSize: '11px'
			});

			clearAllBtn.click(function() {
				UIViewer.clearAllComponents();
			});

			buttonContainer.append(showAllBtn, hideAllBtn, clearAllBtn);
			container.append(buttonContainer);

			// Add status display
			var statusContainer = $('<div id="status-info"></div>');
			statusContainer.css({
				marginBottom: '10px',
				padding: '8px',
				background: 'rgba(255, 255, 255, 0.1)',
				borderRadius: '4px',
				fontSize: '10px',
				lineHeight: '1.3'
			});
			container.append(statusContainer);

			// Update status periodically
			UIViewer.updateStatus();
			setInterval(UIViewer.updateStatus, 2000);

			// Add component list
			var componentList = $('<div id="component-list"></div>');
			UIViewer.components.forEach(function(componentName) {
				var item = UIViewer.createComponentItem(componentName);
				componentList.append(item);
			});
			container.append(componentList);

			// Add minimize/maximize functionality
			var minimizeBtn = $('<button>−</button>');
			minimizeBtn.css({
				position: 'absolute',
				top: '5px',
				right: '5px',
				background: '#f44336',
				color: 'white',
				border: 'none',
				width: '20px',
				height: '20px',
				borderRadius: '50%',
				cursor: 'pointer',
				fontSize: '14px',
				lineHeight: '1'
			});

			var isMinimized = false;
			var originalHeight = container.height();
			
			minimizeBtn.click(function() {
				if (isMinimized) {
					container.css('height', 'auto');
					componentList.show();
					buttonContainer.show();
					$(this).text('−');
					isMinimized = false;
				} else {
					componentList.hide();
					buttonContainer.hide();
					container.css('height', '50px');
					$(this).text('+');
					isMinimized = true;
				}
			});

			container.append(minimizeBtn);
			$('body').append(container);

			// Make draggable
			UIViewer.makeDraggable(container[0]);
		};

		/**
		 * Create a component item in the list
		 */
		UIViewer.createComponentItem = function CreateComponentItem(componentName) {
			var item = $('<div class="component-item"></div>');
			item.css({
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
				padding: '5px 0',
				borderBottom: '1px solid #333',
				marginBottom: '5px'
			});

			var label = $('<span>' + componentName + '</span>');
			label.css({
				flex: '1',
				marginRight: '10px'
			});

			var toggleBtn = $('<button>Show</button>');
			toggleBtn.css({
				background: '#2196F3',
				color: 'white',
				border: 'none',
				padding: '3px 8px',
				borderRadius: '3px',
				cursor: 'pointer',
				fontSize: '10px',
				minWidth: '50px'
			});

			toggleBtn.click(function() {
				var isActive = UIViewer.activeComponents[componentName];
				UIViewer.toggleComponent(componentName, !isActive);
			});

			item.append(label, toggleBtn);
			return item;
		};

		/**
		 * Toggle a UI component
		 */
		UIViewer.toggleComponent = function ToggleComponent(componentName, forceShow) {
			var isActive = UIViewer.activeComponents[componentName];
			var shouldShow = forceShow !== undefined ? forceShow : !isActive;

			if (shouldShow && !isActive) {
				// Load and show component
				require(['UI/Components/' + componentName + '/' + componentName], function(Component) {
					try {
						if (Component && typeof Component.append === 'function') {
							// Component is already registered with UIManager when loaded
							// Get the component from UIManager to ensure proper integration
							var managedComponent;
							try {
								managedComponent = UIManager.getComponent(componentName);
							} catch (e) {
								// If not found in UIManager, use the loaded component directly
								managedComponent = Component;
								console.log('UIViewer: Component ' + componentName + ' not found in UIManager, using direct reference');
							}

							// Check if component supports getUI() method (for versioned components)
							if (typeof managedComponent.getUI === 'function') {
								managedComponent = managedComponent.getUI();
							}

							// Prepare and append the component
							if (typeof managedComponent.prepare === 'function') {
								managedComponent.prepare();
							}
							
							// Handle components that might already be appended
							if (managedComponent.__active) {
								console.log('UIViewer: Component ' + componentName + ' already active');
							} else {
								managedComponent.append();
							}
							
							UIViewer.activeComponents[componentName] = managedComponent;
							UIViewer.updateButton(componentName, true);
							UIViewer.updateStatus();
							console.log('UIViewer: Showing ' + componentName);
						} else {
							console.warn('UIViewer: Component ' + componentName + ' does not have append method');
							UIViewer.updateButton(componentName, false);
						}
					} catch (error) {
						console.error('UIViewer: Error showing ' + componentName + ':', error);
						UIViewer.updateButton(componentName, false);
					}
				}, function(error) {
					console.error('UIViewer: Failed to load ' + componentName + ':', error);
					UIViewer.updateButton(componentName, false);
				});
			} else if (!shouldShow && isActive) {
				// Hide component
				try {
					var component = UIViewer.activeComponents[componentName];
					if (component && typeof component.remove === 'function') {
						component.remove();
						delete UIViewer.activeComponents[componentName];
						UIViewer.updateButton(componentName, false);
						UIViewer.updateStatus();
						console.log('UIViewer: Hiding ' + componentName);
					}
				} catch (error) {
					console.error('UIViewer: Error hiding ' + componentName + ':', error);
				}
			}
		};

		/**
		 * Update button state
		 */
		UIViewer.updateButton = function UpdateButton(componentName, isActive) {
			var item = $('#component-list').find('.component-item').filter(function() {
				return $(this).find('span').text() === componentName;
			});
			
			var button = item.find('button');
			if (isActive) {
				button.text('Hide').css('background', '#f44336');
			} else {
				button.text('Show').css('background', '#2196F3');
			}
		};

		/**
		 * Clear all currently active components
		 */
		UIViewer.clearAllComponents = function ClearAllComponents() {
			for (var componentName in UIViewer.activeComponents) {
				if (UIViewer.activeComponents.hasOwnProperty(componentName)) {
					UIViewer.toggleComponent(componentName, false);
				}
			}
			UIViewer.updateStatus();
		};

		/**
		 * Update the status display
		 */
		UIViewer.updateStatus = function UpdateStatus() {
			var activeCount = Object.keys(UIViewer.activeComponents).length;
			var registeredCount = Object.keys(UIManager.components).length;
			var preloadedComponents = ['Emoticons', 'ItemInfo', 'WinPopup', 'ContextMenu', 'ItemCompare', 'Escape', 'InputBox'];
			
			var statusText = 'Active: ' + activeCount + ' | UIManager: ' + registeredCount + '\n';
			statusText += 'Pre-loaded: ' + preloadedComponents.length + '\n';
			
			if (activeCount > 0) {
				statusText += '\nActive Components:\n';
				for (var componentName in UIViewer.activeComponents) {
					if (UIViewer.activeComponents.hasOwnProperty(componentName)) {
						var component = UIViewer.activeComponents[componentName];
						var isInManager = componentName in UIManager.components;
						var isPreloaded = preloadedComponents.indexOf(componentName) !== -1;
						statusText += '• ' + componentName + (isInManager ? ' ✓' : ' ⚠') + (isPreloaded ? ' (P)' : '') + '\n';
					}
				}
			}
			
			$('#status-info').text(statusText.trim());
		};

		/**
		 * Make element draggable
		 */
		UIViewer.makeDraggable = function MakeDraggable(element) {
			var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
			
			element.onmousedown = dragMouseDown;

			function dragMouseDown(e) {
				e = e || window.event;
				e.preventDefault();
				pos3 = e.clientX;
				pos4 = e.clientY;
				document.onmouseup = closeDragElement;
				document.onmousemove = elementDrag;
			}

			function elementDrag(e) {
				e = e || window.event;
				e.preventDefault();
				pos1 = pos3 - e.clientX;
				pos2 = pos4 - e.clientY;
				pos3 = e.clientX;
				pos4 = e.clientY;
				element.style.top = (element.offsetTop - pos2) + "px";
				element.style.left = (element.offsetLeft - pos1) + "px";
			}

			function closeDragElement() {
				document.onmouseup = null;
				document.onmousemove = null;
			}
		};

		/**
		 * Handle window resize - integrate with UIManager
		 */
		UIViewer.onResize = function OnResize() {
			try {
				// Use UIManager's resize handling for all managed components
				UIManager.fixResizeOverflow(window.innerWidth, window.innerHeight);
			} catch (error) {
				console.error('UIViewer: Error during resize handling:', error);
			}
		};

		/**
		 * Setup window resize handling
		 */
		UIViewer.setupResizeHandling = function SetupResizeHandling() {
			$(window).on('resize', UIViewer.onResize);
		};

		// Initialize the UIViewer
		UIViewer.init();
		
		// Setup resize handling after initialization
		UIViewer.setupResizeHandling();
	}
); 