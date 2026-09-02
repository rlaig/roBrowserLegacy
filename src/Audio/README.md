# Audio Module Summary

This document provides a summary of the files in the `src/Audio` folder, explaining their core functions and purposes.

## SoundManager.js

**Core Function**: Manages sound effects in the application.

**Purpose**: 
- Handles the playing, stopping, and volume control of sound effects (WAV files)
- Implements a sound caching system to improve performance
- Provides position-based sound playback with volume adjustment based on distance
- Manages memory usage by limiting the number of concurrent sound instances
- Self-balances audio resources based on the number of media players in use

**Key Features**:
- Sound instance management with limits to prevent browser overload
- Sound caching for reuse to improve performance
- Position-based sound playback with distance-based volume adjustment
- Memory cleanup for unused sound instances
- Volume control that respects user preferences

## BGM.js

**Core Function**: Manages background music in the application.

**Purpose**:
- Handles the playing, stopping, and volume control of background music (MP3 files)
- Provides fallback support for browsers that don't support HTML5 audio
- Uses Flash as a fallback for MP3 playback when HTML5 audio is not available

**Key Features**:
- Dual implementation using HTML5 Audio API and Flash fallback
- Automatic detection of supported audio formats
- Looping functionality for continuous background music
- Volume control that respects user preferences
- Ability to load music files from various sources (HTTP, Data URI, or Blob)

## mp3-player Directory

**Core Function**: Provides Flash-based MP3 playback support.

**Purpose**:
- Serves as a fallback solution for browsers that don't support MP3 playback via HTML5
- Contains the necessary Flash components for MP3 playback

**Contents**:
- `mp3-player.swf`: Flash player for MP3 playback
- `license.txt`: MPL 1.1 license information for the mp3-player
- `readme.txt`: Brief description and links to the original project

**Note**: The mp3-player is based on an open-source project available at https://github.com/neolao/mp3-player and is licensed under MPL 1.1. 