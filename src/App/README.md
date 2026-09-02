# src/App Directory Documentation

This directory contains the main application entry points for different ROBrowser components. Each file serves as a specific viewer or application mode within the ROBrowser ecosystem.

## File Summaries

### EffectViewer.js
**Purpose:** Displays and visualizes effect files (from Str files) in the ROBrowser environment.

**Core Functions:**
- Initializes the effect viewer component
- Handles API messages for loading and stopping effects
- Manages thread initialization and client setup

### GrannyModelViewer.js
**Purpose:** Displays Gravity's Granny3D models (gr2 files) used in the game.

**Core Functions:**
- Initializes the Granny model viewer component
- Handles API messages for loading and stopping model rendering
- Manages thread initialization and client setup

### GrfViewer.js
**Purpose:** Provides a viewer for GRF archives (Gravity Resource Files), which are the main resource containers for Ragnarok Online.

**Core Functions:**
- Initializes the GRF viewer component
- Provides a simple interface for browsing GRF contents
- Handles file extraction and viewing

### MapViewer.js
**Purpose:** Provides a standalone map viewer for exploring Ragnarok Online maps (RSW files).

**Core Functions:**
- Initializes the map renderer and camera
- Provides a dropdown menu for selecting different maps
- Handles user interaction for navigating the map
- Manages API communication for remote control

### ModelViewer.js
**Purpose:** Displays Gravity models (RSM files) used for objects and structures in the game.

**Core Functions:**
- Initializes the model viewer component
- Handles API messages for loading and stopping model rendering
- Manages thread initialization and client setup

### Online.js
**Purpose:** Main entry point for the ROBrowser client in online mode.

**Core Functions:**
- Initializes the game engine
- Sets up loading spinner for visual feedback during initialization
- Manages plugin initialization
- Handles browser exit confirmation

### StrViewer.js
**Purpose:** Displays Str file effects, which are used for visual effects in the game.

**Core Functions:**
- Initializes the Str viewer component
- Handles API messages for loading and stopping effects
- Manages thread initialization and client setup

### UIViewer.js
**Purpose:** Interactive UI Component Viewer for testing and debugging individual UI components.

**Core Functions:**
- Provides a toggleable interface for showing/hiding UI components
- Lists all available UI components with individual controls
- Includes batch operations (Show All/Hide All)
- Features a draggable, minimizable control panel
- Handles component loading and error management
- Useful for UI development and testing purposes