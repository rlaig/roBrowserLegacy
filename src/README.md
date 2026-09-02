# `src` Directory Structure and Usage

This document describes the purpose of each top-level folder under `src`, highlights key files/subfolders, and explains typical usage patterns when developing features.

## Quick overview

```text
src/
  App/               # App entry points (online client, viewers)
  Audio/             # BGM and SFX playback and orchestration
  Controls/          # Input handling and gameplay control bindings
  Core/              # Cross-cutting client runtime (context, files, memory, threads)
  DB/                # Static data tables (items, skills, maps, status, etc.)
  Engine/            # Game flow engines (login, char select, map) and orchestration
  Loaders/           # Parsers and loaders for game resource formats (RSM, GR2, STR, etc.)
  Network/           # Networking, packets, versions, crypt, sockets
  Preferences/       # User-configurable settings models (graphics, audio, controls)
  Plugins/           # Plugin system integration
  Renderer/          # Low-level renderers for map, sprites, effects, entities
  UI/                # UI system, base component, windows, cursors
  Utils/             # Utility modules (webgl helpers, binary IO, inflate, pathfinding)
  Vendors/           # Third-party libraries bundled in-repo
```

---

## `App/` — Application entry points

- **Purpose**: Standalone entry files for running the client or viewers (map/model/effect/GRF, etc.).
- **Notable files**:
  - `Online.js`: main online client bootstrap.
  - `MapViewer.js`, `ModelViewer.js`, `GrannyModelViewer.js`, `StrViewer.js`, `EffectViewer.js`, `GrfViewer.js`.
- **Usage**: Launch different modes (dev tools, viewers) and wire engines, threads, and client setup. See `App/README.md` for detailed per-file notes.

## `Audio/` — Sound and music

- **Purpose**: BGM and SFX playback control.
- **Key files**: `SoundManager.js` (orchestration), `BGM.js` (music handling).
- **Usage**: Invoked by Engine/UI/Entity events to play sounds and background music.

## `Controls/` — Input and control logic

- **Purpose**: Map keyboard/mouse inputs to game actions.
- **Key files**: `ProcessCommand.js`, `KeyEventHandler.js`, `MouseEventHandler.js`, `MapControl.js`, `EntityControl.js`, `BattleMode.js`, `ScreenShot.js`.
- **Usage**: Subscribed by engines/UI to translate inputs into in-game commands.

## `Core/` — Client runtime

- **Purpose**: Core services used across the application.
- **Key files**:
  - `Client.js`, `Context.js`: client state/context holders.
  - `FileSystem.js`, `FileManager.js`: file access and GRF/virtual FS integration.
  - `MemoryManager.js`, `MemoryItem.js`: memory/object lifecycle helpers.
  - `Thread.js`, `ThreadEventHandler.js`: threading/worker event handling.
  - `Events.js`: event bus/utilities.
  - `AIDriver.js`: AI loop driver.
  - `Preferences.js`, `Configs.js`, `Mobile.js`.
- **Usage**: Imported by engines, renderer, and UI for common services and lifecycle management.

## `DB/` — Static data tables

- **Purpose**: Game data definitions and lookup tables.
- **Top subfolders**:
  - `Map/`: `WorldMap.js`, `MapTable.js`, `MapState.js`.
  - `Effects/`: `EffectTable.js`, `EffectConst.js`.
  - `Status/`: `StatusInfo.js`, `StatusConst.js`, `StatusProperty.js`, `StatusState.js`.
  - `Skills/`: `SkillInfo.js`, `SkillConst.js`, `SkillAction.js`, `SkillEffect.js`, `SkillUnit*`, `SkillDescription.js`.
  - `Monsters/`: `MonsterTable.js`, `MonsterNameTable.js`, `ShadowTable.js`.
  - `Pets/`: `Pet*` tables and consts.
  - `Jobs/`: `JobConst.js`, `Job*Table.js`, `WeaponAction.js`, `Mount*`.
  - `Items/`: `ItemTable.js` (large), `ItemEffect.js`, `EquipmentLocation.js`, `Weapon*Table.js`, `HatTable.js`, `RobeTable.js`.
- **Other key files**: `DBManager.js`, `TownInfo.js`, `Emotions*.js`, `QuestTable.js`.
- **Usage**: Read-only sources of truth for gameplay values; consumed by engines, UI, and renderer.

## `Engine/` — Game flow and orchestration

- **Purpose**: Manages overall game states and transitions.
- **Key files**: `GameEngine.js`, `LoginEngine.js`, `CharEngine.js`, `MapEngine.js`, `SessionStorage.js`.
- **Subfolder**: `MapEngine/` — granular map/effect modules used during map scene rendering and interactions (e.g., `TwoDEffect.js`, `ThreeDEffect.js`, `Damage.js`, `Tiles.js`).
- **Usage**: Coordinates Renderer, UI, Network, Audio, and DB to run the game loop.

## `Loaders/` — Resource parsers

- **Purpose**: Parse Gravity/RO formats and expose runtime objects.
- **Key files**: `Model.js` (RSM), `GrannyModel.js` (GR2), `Sprite.js` (SPR/ACT), `Str.js` (effects), `Targa.js` (TGA), `World.js`/`Ground.js`/`Altitude.js` (map data), `MapLoader.js`, `GameFile.js`, `GameFileDecrypt.js`, `Action.js`.
- **Usage**: Used by Core/Renderer/Engine to load assets from GRF or external sources.

## `Network/` — Connectivity and packets

- **Purpose**: Network stack for server communication.
- **Key files**:
  - `NetworkManager.js`: high-level networking controller.
  - `PacketStructure.js`, `PacketRegister.js`, `PacketVersions.js`, `PacketLength.js`: packet formats, registration, versioning.
  - `PacketCrypt.js`: encryption/decryption.
- **Subfolders**:
  - `SocketHelpers/`: `WebSocket.js`, `NodeSocket.js` abstractions.
  - `Packets/`: versioned packet length/structure tables (by year).
- **Usage**: Engines and controls use this layer to send/receive game protocol messages.

## `Preferences/` — User settings models

- **Purpose**: Declarative settings for subsystems.
- **Key files**: `Controls.js`, `Graphics.js`, `Map.js`, `Audio.js`, `Camera.js`, `ShortCutControls.js`.
- **Usage**: Loaded by Core/Engine/UI to configure behavior and expose toggles in settings UIs.

## `Plugins/` — Plugin integration

- **Purpose**: Plugin lifecycle and registration.
- **Key files**: `PluginManager.js`.
- **Usage**: Engines bootstrap plugins; plugins can hook into events, UI, and network.

## `Renderer/` — Rendering system

- **Purpose**: Low-level rendering of sprites, entities, maps, and effects.
- **Key files**: `Renderer.js` (bootstrap), `MapRenderer.js`, `SpriteRenderer.js`, `EntityManager.js`, `EffectManager.js`, `Camera.js`, `ItemObject.js`.
- **Subfolders**:
  - `Map/`: `Ground.js`, `Water.js`, `Altitude.js`, `Models.js`, `Effects.js`, `GridSelector.js`, `Sounds.js`.
  - `Entity/`: rendering pipelines and state machines (`EntityRender.js`, `EntityState.js`, `EntityView.js`, etc.).
  - `Effects/`: specialized effect renderers (auras, rings, cylinders, tiles, magic, etc.).
- **Usage**: Called from engines to render frames; consumes data from Loaders/DB and inputs from Controls.

## `UI/` — User interface system

- **Purpose**: UI framework and windows.
- **Key files**: `UIManager.js` (window manager), `UIComponent.js` (base class), `CursorManager.js`, `Scrollbar.js`, `Background.js`, `UIVersionManager.js`, `Common.css`.
- **Subfolder**: `Components/` — many folders, each representing a window/screen (e.g., login, character select, inventory, chat, map, vending, refine, etc.).
- **Usage**: Engines open/close components via `UIManager`; components extend `UIComponent` and communicate with engines and Network.

## `Utils/` — Utilities

- **Purpose**: Shared utility modules and third-party wrappers.
- **Key files**: `WebGL.js`, `PathFinding.js`, `BinaryReader.js`, `BinaryWriter.js`, `Inflate.js`, `CRC32.js`, `ConsoleManager.js`, `Executable.js`, `Queue.js`, `Struct.js`, `colors.js`, `gl-matrix.js`, `html2canvas.js`, `jquery.js`, `partyColors.js`, `Texture.js`.
- **Usage**: Imported across the codebase; avoid duplicating helpers—add here.

## `Vendors/` — Third-party libraries

- **Purpose**: Bundled vendor scripts not installed via npm.
- **Notable files**: `require.js`, `text.require.js`, `xmlparse.js`, `gl-matrix.js`, `jquery-1.9.1.js`, `spark-md5.min.js`, `text-encoding.js`, `wasmoon-lua5.1.js`, `fengari-web.js`, `lodash.js`.
- **Usage**: Loaded by the app bootstrap or via AMD/RequireJS where needed.

---

## Typical development tasks

- **Add a new UI window**: create under `UI/Components/<WindowName>/`, extend `UIComponent`, register/open it via `UIManager`.
- **Parse a new resource format**: add a loader in `Loaders/`, expose a clean API, and integrate with `FileManager` and `Renderer`.
- **Introduce gameplay data**: add/extend tables under `DB/` and, if needed, extend `DBManager`.
- **Handle a new packet**: define/update structures in `Network/Packet*` and register with `PacketRegister`.
- **Add settings**: define schema under `Preferences/` and surface toggles in relevant UI components.
- **Render a new effect/entity feature**: implement under `Renderer/Effects` or `Renderer/Entity` and drive it from `Engine/MapEngine` as needed. 