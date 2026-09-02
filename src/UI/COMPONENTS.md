### UI Components: Structure and Usage

This document explains how `UI/Components/*` is organized, how components are versioned and loaded, and provides an index of available components.

## Component architecture

- **Wrapper module**: Each top-level component folder exposes a wrapper `UI/Components/<Name>/<Name>.js` that:
  - Declares a public component name used by `UIManager` (e.g., `WinLogin`, `Inventory`, `MiniMap`, `CharCreate`).
  - Imports one or more versioned implementations (`<Name>V1`, `V2`, …) and their HTML/CSS.
  - Uses `UIVersionManager.getUIController(publicName, versionInfo)` to select the correct implementation based on `PACKETVER`/configs.
- **Versioned implementation**: Lives in a nested folder, e.g. `UI/Components/<Name>/<NameV2>/<NameV2>.{js,html,css}`. Additional helpers may exist (e.g., `History.js`).
- **Single-version components**: Some components ship a single set of files directly under `UI/Components/<Name>/` (e.g., `ChatBox.js`, `ChatBox.html`, `ChatBox.css`).
- **Base class**: All window implementations extend/compose `UI/UIComponent`. They typically implement lifecycle hooks like `init`, `append`, `remove`, `onKeyDown`, `onResize` and use `this.parseHTML` to initialize bitmap-based buttons and UI skins.

## Versioning pattern (example)

```javascript
// UI/Components/Inventory/Inventory.js
var publicName = 'Inventory';
var InventoryV0 = require('./InventoryV0/InventoryV0');
var InventoryV1 = require('./InventoryV1/InventoryV1');
var InventoryV2 = require('./InventoryV2/InventoryV2');
var InventoryV3 = require('./InventoryV3/InventoryV3');
var UIVersionManager = require('UI/UIVersionManager');
var versionInfo = {
  default: InventoryV0,
  common: {
    20181219: InventoryV3,
    20170208: InventoryV2,
    20111207: InventoryV1,
  },
  re: {},
  prere: {}
};
var Controller = UIVersionManager.getUIController(publicName, versionInfo);
return Controller;
```

- `UIVersionManager` selects the best match by date and stores an alias so `UIManager.getComponent('<PublicName>')` resolves to the selected implementation.

## Using components at runtime

- Obtain a component: `var win = UIManager.getComponent('WinPopup').clone('MyPopup');`
- Prepare and show: `win.append();`
- Remove: `win.remove();`
- For modal error popup, see `UIManager.showErrorBox(text)`.

## Representative components and purpose

Note: Names mirror their in-game window or feature. Many components have multiple versions.

- Authentication & character
  - `WinLogin/` (login window)
  - `CharCreate/` (character creation)
  - `CharSelect/` (character selection)
  - `PincodeWindow/` (PIN / secondary auth)
- Chat & communication
  - `ChatBox/` (main chat box, history)
  - `ChatRoom/`, `ChatRoomCreate/` (chat room windows)
  - `Rodex/` (in-game mail system)
  - `Mail/`, `PrivateMessage` (PM/mail—if present)
- Social & groups
  - `Guild/` (guild UI)
  - `PartyFriends/`, `Friends/`, `Group/` (party/friends/group management)
  - `EntityRoom/`, `EntitySignboard/` (entity overlays/rooms)
- Inventory & equipment
  - `Inventory/` (inventory with versioned layouts V0–V3)
  - `Equipment/`, `PlayerEquipment/`, `PlayerViewEquip/` (equipment windows)
  - `ItemInfo/`, `ItemCompare/`, `ItemSelection/` (item info/selectors)
  - `SwitchEquip/` (equipment set switch)
  - `ItemObtain/`, `ItemReform/` (obtain/reform dialogs)
- Skills & status
  - `SkillList/`, `SkillListMH/` (skill lists)
  - `SkillDescription/`, `SkillTargetSelection/` (skill descriptions/targeting)
  - `StatusIcons/` (status overlays)
  - `BasicInfo/`, `WinStats/` (basic player info and stats)
  - `Sense/` (monster info sense window)
- Map & navigation
  - `MiniMap/` (minimap; versioned)
  - `WorldMap/` (world map)
  - `Navigation/` (path/quest navigation)
  - `MapName/` (map banner/title)
- Trade & economy
  - `Trade/` (player trading)
  - `Vending/`, `VendingShop/` (vending windows)
  - `NpcStore/` (NPC store/shop)
  - `CartItems/`, `ChangeCart/` (merchant cart management)
  - `Bank/` (banking), `CashShop/` (cash shop)
- Quests & progression
  - `Quest/` (quest log/tracker)
  - `CheckAttendance/` (attendance/events)
- Companions & mercenaries
  - `MercenaryInformations/`, `HomunInformations/`, `PetInformations/`
- Options & system
  - `GraphicsOption/`, `SoundOption/` (settings)
  - `Escape/` (system/escape menu)
  - `FPS/` (FPS display)
  - `WinList/`, `WinPopup/`, `WinPrompt/` (generic window utilities)
  - `Error/` (error dialogs)
- Viewers & tools
  - `ModelViewer/`, `GrannyModelViewer/`, `EffectViewer/`, `StrViewer/`
  - `GrfViewer/`
- Miscellaneous UI
  - `Announce/` (announcements)
  - `InputBox/` (text input)
  - `Emoticons/` (emote selector)
  - `Intro/` (intro/splash)
  - `EntityRoom/`, `EntitySignboard/`
  - `LaphineSys/`, `LaphineUpg/` (system-specific UIs)
  - `MakeArrowSelection/`, `MakeItemSelection/`, `MakeReadBook/`
  - `NPC` windows: `NpcMenu/`, `NpcBox/`
  - `PlayerEquipment/`, `PlayerViewEquip/`
  - `Refine/`, `RefineWeaponSelection/`
  - `ShortCut/`, `ShortCutOption/`, `ShortCuts/`
  - `SlotMachine/`
  - `SoundOption/`
  - `StatusIcons/`
  - `StrViewer/`
  - `WinStats/`

The above list reflects folders present in `UI/Components/` and may include additional helpers inside each folder (HTML/CSS/JS files).

## Creating a new component

1. Create `UI/Components/<Name>/<Name>.js` wrapper. If versioned, add `UIVersionManager` mapping and delegate to `V2`, `V3`, etc.
2. Implement `UI/Components/<Name>/<NameV#>/<NameV#>.js` with matching `.html` and `.css`.
3. Expose lifecycle methods expected by `UIComponent` (`init`, `append`, `remove`, optional `onResize`, `onKeyDown`).
4. Register/open via `UIManager`:
   - `var ui = UIManager.getComponent('<PublicName>').clone('<InstanceId>');`
   - `ui.append();`

## Notes

- `UIVersionManager` also sets a public alias so `UIManager.getComponent('<PublicName>')` resolves to the selected version name.
- Many windows use bitmap-based skins; ensure buttons and elements include the required `data-background`, `data-hover`, `data-down` attributes and call `this.parseHTML`. 