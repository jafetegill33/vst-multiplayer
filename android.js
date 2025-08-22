class MobileVikingSettlementTycoon {
    constructor() {
        this.gameVersion = '1.0.0';
        this.deviceInfo = this.collectDeviceInfo();
        
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Multiplayer setup
        this.socket = null;
        this.worldId = null;
        this.isMultiplayer = true;
        this.otherPlayers = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Game state
        this.camera = { x: 0, y: 0, scale: 1 };
        this.resources = {
            food: 100,
            wood: 50,
            iron: 25,
            gold: 10
        };
        this.population = 5;
        this.buildings = [];
        this.selectedBuilding = null;
        this.placementMode = false;
        
        // Mobile-specific properties
        this.activeTab = 'buildings';
        // Enhanced touch handling for zoom
        this.touchStartTime = 0;
        this.longPressThreshold = 800; // 800ms for long press
        this.longPressTimer = null;
        this.lastTapTime = 0;
        this.doubleTapThreshold = 300; // 300ms for double tap
        this.pinchStartDistance = 0;
        this.pinchStartScale = 1;
        this.isPinching = false;
        
        // Enhanced infinite terrain system (mobile optimized)
        this.chunkSize = 256; // Smaller chunks for mobile performance
        this.tileSize = 16; // Smaller tiles for mobile optimization
        this.loadedChunks = new Map(); // Map of chunk coordinates to chunk data
        this.chunkLoadRadius = 2; // Reduced for mobile performance
        this.seed = Math.random() * 10000; // Seed for consistent generation
        
        // Exploration system
        this.fogOfWar = new Map(); // Map of chunk coordinates to fog canvas
        this.scouts = [];
        this.exploredAreas = new Set();
        this.revealAnimations = [];
        
        // Touch handling
        this.touchState = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            startTime: 0
        };
        
        // Game loop
        this.lastUpdate = 0;
        this.gameRunning = true;
        
        this.init();
    }
    
    collectDeviceInfo() {
        // Collect minimal, privacy-respecting device information
        const info = {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1,
            platform: this.getPlatformInfo(),
            browser: this.getBrowserInfo(),
            touchSupport: 'ontouchstart' in window,
            orientation: screen.orientation ? screen.orientation.type : 'unknown'
        };
        
        return info;
    }
    
    getPlatformInfo() {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) return 'Android';
        if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
        if (userAgent.includes('mobile')) return 'Mobile';
        return 'Unknown';
    }
    
    getBrowserInfo() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }
    
    init() {
        this.setupCanvas();
        this.connectToServer();
        this.setupMobileUI();
        this.setupMobileEventListeners();
        this.gameLoop();
    }
    
    connectToServer() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Mobile connected to multiplayer server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.showMobileNotification('Connected to server!', 'success');
                this.joinWorld();
            });
            
            this.socket.on('disconnect', () => {
                console.log('Mobile disconnected from server');
                this.isConnected = false;
                this.showMobileNotification('Disconnected from server', 'warning');
                this.attemptReconnect();
            });
            
            // Same event handlers as desktop version
            this.socket.on('world_joined', (data) => this.handleWorldJoined(data));
            this.socket.on('player_joined', (data) => this.handlePlayerJoined(data));
            this.socket.on('player_left', (data) => this.handlePlayerLeft(data));
            this.socket.on('building_placed', (data) => this.handleBuildingPlaced(data));
            this.socket.on('building_rejected', (data) => this.handleBuildingRejected(data));
            this.socket.on('scout_sent', (data) => this.handleScoutSent(data));
            this.socket.on('scout_rejected', (data) => this.handleScoutRejected(data));
            this.socket.on('player_updated', (data) => this.handlePlayerUpdated(data));
            this.socket.on('player_camera_updated', (data) => this.handlePlayerCameraUpdated(data));
            this.socket.on('chunks_data', (data) => this.handleChunksData(data));
            this.socket.on('area_explored', (data) => this.handleAreaExplored(data));
            this.socket.on('error', (data) => {
                console.error('Mobile server error:', data.message);
                this.showMobileNotification(data.message, 'error');
            });
            
        } catch (error) {
            console.error('Mobile failed to connect to server:', error);
            this.showMobileNotification('Failed to connect to server', 'error');
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            
            setTimeout(() => {
                console.log(`Mobile reconnection attempt ${this.reconnectAttempts}`);
                this.connectToServer();
            }, delay);
        } else {
            this.showMobileNotification('Unable to reconnect. Please refresh.', 'error');
        }
    }
    
    joinWorld(worldId = null) {
        if (this.socket && this.isConnected) {
            this.socket.emit('join_world', {
                worldId: worldId,
                playerName: localStorage.getItem('playerName') || 'Mobile Viking'
            });
        }
    }
    
    handleWorldJoined(data) {
        const { worldId, playerData, worldData, otherPlayers } = data;
        
        this.worldId = worldId;
        this.resources = playerData.resources || this.resources;
        this.population = playerData.population || this.population;
        this.buildings = playerData.buildings || this.buildings;
        this.scouts = playerData.scouts || this.scouts;
        this.camera = playerData.camera || this.camera;
        
        if (playerData.explored_areas) {
            this.exploredAreas = new Set(playerData.explored_areas);
        }
        
        this.otherPlayers.clear();
        otherPlayers.forEach(player => {
            this.otherPlayers.set(player.socket_id, player);
        });
        
        if (playerData.fog_of_war) {
            this.restoreFogOfWarFromServer(playerData.fog_of_war);
        }
        
        this.loadNearbyChunks();
        this.updateMobileResourceDisplay();
        this.updateMobilePopulationDisplay();
        this.updateMobileStatsDisplay();
        
        this.showMobileNotification(`Joined world ${worldId}!`, 'success');
    }
    
    handlePlayerJoined(data) {
        const { socketId, playerName, camera } = data;
        this.otherPlayers.set(socketId, {
            socket_id: socketId,
            player_name: playerName,
            camera: camera
        });
        this.showMobileNotification(`${playerName} joined!`, 'info');
    }
    
    handlePlayerLeft(data) {
        const { playerId } = data;
        const player = this.otherPlayers.get(playerId);
        if (player) {
            this.otherPlayers.delete(playerId);
            this.showMobileNotification(`${player.player_name} left`, 'info');
        }
    }
    
    handleBuildingPlaced(data) {
        const { playerId, building, playerResources } = data;
        
        if (playerId === this.socket.id) {
            this.resources = playerResources;
            this.updateMobileResourceDisplay();
            this.cancelMobilePlacement();
        } else {
            this.buildings.push(building);
        }
        
        this.showMobileNotification(`${building.name} built!`, 'success');
    }
    
    handleBuildingRejected(data) {
        const { reason } = data;
        this.showMobileNotification(reason, 'error');
        this.cancelMobilePlacement();
    }
    
    handleScoutSent(data) {
        const { playerId, scout } = data;
        
        if (playerId === this.socket.id) {
            const myScout = this.scouts.find(s => s.id === scout.id);
            if (myScout) {
                Object.assign(myScout, scout);
            }
        }
        
        this.showMobileNotification('Scout dispatched!', 'success');
    }
    
    handleScoutRejected(data) {
        const { reason } = data;
        this.showMobileNotification(reason, 'warning');
    }
    
    handlePlayerUpdated(data) {
        const { playerId, resources, population, scouts } = data;
        
        if (playerId === this.socket.id) {
            if (resources) this.resources = resources;
            if (population) this.population = population;
            if (scouts) this.scouts = scouts;
            
            this.updateMobileResourceDisplay();
            this.updateMobilePopulationDisplay();
        }
    }
    
    handlePlayerCameraUpdated(data) {
        const { playerId, camera } = data;
        const player = this.otherPlayers.get(playerId);
        if (player) {
            player.camera = camera;
        }
    }
    
    handleChunksData(data) {
        const { chunks } = data;
        
        chunks.forEach(({ chunkKey, chunk }) => {
            this.loadedChunks.set(chunkKey, {
                ...chunk,
                textureCanvas: this.createMobileChunkCanvas(chunk),
                detailCanvas: this.createMobileChunkDetailCanvas(chunk)
            });
            
            if (!this.fogOfWar.has(chunkKey)) {
                this.initializeChunkFogOfWar(chunk.x, chunk.y);
            }
        });
    }
    
    handleAreaExplored(data) {
        const { scoutId, x, y, range } = data;
        this.revealArea(x, y, range);
        this.showMobileNotification('Area explored!', 'success');
        this.saveFogOfWarToServer();
    }
    
    setupCanvas() {
        const resize = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        };
        
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => {
            setTimeout(resize, 100);
        });
    }
    
    setupMobileUI() {
        // Update device info display
        document.getElementById('gameVersion').textContent = this.gameVersion;
        document.getElementById('screenSize').textContent = `${this.deviceInfo.screenWidth}×${this.deviceInfo.screenHeight}`;
        document.getElementById('platformInfo').textContent = this.deviceInfo.platform;
        document.getElementById('browserInfo').textContent = this.deviceInfo.browser;
        
        this.updateMobileResourceDisplay();
        this.updateMobilePopulationDisplay();
        this.updateMobileStatsDisplay();
    }
    
    setupMobileEventListeners() {
        // Tab navigation
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Building selection
        document.querySelectorAll('.mobile-building-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const buildingType = card.dataset.building;
                this.selectMobileBuilding(buildingType);
            });
        });
        
        // Action buttons - Updated for multiplayer
        document.getElementById('mobileNewTerritoryBtn').addEventListener('click', () => {
            this.createNewMobileWorld();
        });
        
        document.getElementById('mobileSaveBtn').addEventListener('click', () => {
            this.showMobileNotification('Saved to server!', 'success');
        });
        
        // Modal close buttons
        document.querySelectorAll('.mobile-modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.mobile-modal').classList.remove('active');
            });
        });
        
        // Canvas touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        
        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    createNewMobileWorld() {
        if (this.socket && this.isConnected) {
            this.socket.disconnect();
            setTimeout(() => {
                this.connectToServer();
            }, 1000);
        }
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.mobile-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`mobile${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).classList.add('active');
        
        this.activeTab = tabName;
    }
    
    selectMobileBuilding(buildingType) {
        this.selectedBuilding = buildingType;
        this.placementMode = true;
        
        // Update UI
        document.querySelectorAll('.mobile-building-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelector(`[data-building="${buildingType}"]`).classList.add('selected');
        
        this.showMobileNotification(`Tap the map to place ${buildingType}`, 'success');
    }
    
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getTouchCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    handleTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            // Check for double tap
            const now = Date.now();
            if (now - this.lastTapTime < this.doubleTapThreshold) {
                this.handleDoubleTap(touch.clientX - rect.left, touch.clientY - rect.top);
                this.lastTapTime = 0; // Reset to prevent triple tap
                return;
            }
            this.lastTapTime = now;
            
            this.touchState = {
                active: true,
                startX: touch.clientX - rect.left,
                startY: touch.clientY - rect.top,
                currentX: touch.clientX - rect.left,
                currentY: touch.clientY - rect.top,
                startTime: Date.now()
            };
            
            // Start long press timer
            this.longPressTimer = setTimeout(() => {
                if (this.touchState.active) {
                    this.handleLongPress();
                }
            }, this.longPressThreshold);
        } else if (e.touches.length === 2) {
            // Start pinch zoom
            this.isPinching = true;
            this.pinchStartDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            this.pinchStartScale = this.camera.scale;
            
            // Clear any existing timers
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        if (e.touches.length === 1 && this.touchState.active && !this.isPinching) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            
            this.touchState.currentX = touch.clientX - rect.left;
            this.touchState.currentY = touch.clientY - rect.top;
            
            // Calculate movement distance
            const dx = this.touchState.currentX - this.touchState.startX;
            const dy = this.touchState.currentY - this.touchState.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If moved too much, cancel long press
            if (distance > 20 && this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            // Pan camera
            this.camera.x -= dx * 0.8 / this.camera.scale;
            this.camera.y -= dy * 0.8 / this.camera.scale;
            
            this.touchState.startX = this.touchState.currentX;
            this.touchState.startY = this.touchState.currentY;
            
            // Send camera update to server (throttled)
            this.throttledCameraUpdate();
        } else if (e.touches.length === 2 && this.isPinching) {
            // Handle pinch zoom
            const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
            const scaleFactor = currentDistance / this.pinchStartDistance;
            
            // Apply zoom with limits
            const newScale = Math.max(0.3, Math.min(3, this.pinchStartScale * scaleFactor));
            
            // Get touch center for zoom focus
            const rect = this.canvas.getBoundingClientRect();
            const center = this.getTouchCenter(e.touches[0], e.touches[1]);
            const centerX = center.x - rect.left;
            const centerY = center.y - rect.top;
            
            // Convert to world coordinates
            const worldX = (centerX / this.camera.scale) + this.camera.x;
            const worldY = (centerY / this.camera.scale) + this.camera.y;
            
            // Apply new scale
            const oldScale = this.camera.scale;
            this.camera.scale = newScale;
            
            // Adjust camera position to zoom towards touch center
            this.camera.x = worldX - (centerX / this.camera.scale);
            this.camera.y = worldY - (centerY / this.camera.scale);
            
            // Send camera update
            this.throttledCameraUpdate();
        }
    }
    
    throttledCameraUpdate = this.throttle(() => {
        if (this.socket && this.isConnected) {
            this.socket.emit('update_camera', {
                camera: this.camera
            });
        }
    }, 100);
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        if (e.touches.length === 0) {
            // All touches ended
            if (this.touchState.active && !this.isPinching) {
                const touchDuration = Date.now() - this.touchState.startTime;
                const dx = Math.abs(this.touchState.currentX - this.touchState.startX);
                const dy = Math.abs(this.touchState.currentY - this.touchState.startY);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // If it was a quick tap (not a drag or long press)
                if (touchDuration < this.longPressThreshold && distance < 20) {
                    // Wait a bit to check for double tap, otherwise handle as single tap
                    setTimeout(() => {
                        if (Date.now() - this.lastTapTime > this.doubleTapThreshold) {
                            this.handleTap(this.touchState.currentX, this.touchState.currentY);
                        }
                    }, this.doubleTapThreshold + 50);
                }
            }
            
            this.touchState.active = false;
            this.isPinching = false;
        } else if (e.touches.length === 1 && this.isPinching) {
            // One finger lifted during pinch, end pinch mode
            this.isPinching = false;
        }
    }
    
    handleDoubleTap(x, y) {
        // Zoom in on double tap
        const zoomFactor = this.camera.scale < 1.5 ? 1.8 : 0.6;
        
        // Convert tap position to world coordinates
        const worldX = (x / this.camera.scale) + this.camera.x;
        const worldY = (y / this.camera.scale) + this.camera.y;
        
        // Apply new scale with limits
        this.camera.scale = Math.max(0.3, Math.min(3, this.camera.scale * zoomFactor));
        
        // Adjust camera to keep the tapped point centered
        this.camera.x = worldX - (x / this.camera.scale);
        this.camera.y = worldY - (y / this.camera.scale);
        
        this.showMobileNotification(
            this.camera.scale > 1.5 ? 'Zoomed in!' : 'Zoomed out!', 
            'success'
        );
    }
    
    handleTap(x, y) {
        if (this.placementMode && this.selectedBuilding) {
            this.tryPlaceMobileBuilding(x, y);
        }
    }
    
    handleLongPress() {
        const worldPos = this.screenToWorld(this.touchState.currentX, this.touchState.currentY);
        this.sendMobileScoutToExplore(worldPos.x, worldPos.y);
    }
    
    sendMobileScoutToExplore(x, y) {
        if (this.socket && this.isConnected) {
            this.socket.emit('send_scout', {
                targetX: x,
                targetY: y
            });
        } else {
            this.showMobileNotification('Not connected to server!', 'error');
        }
    }
    
    tryPlaceMobileBuilding(screenX, screenY) {
        if (!this.socket || !this.isConnected) {
            this.showMobileNotification('Not connected to server!', 'error');
            return;
        }
        
        const worldPos = this.screenToWorld(screenX, screenY);
        
        this.socket.emit('place_building', {
            buildingType: this.selectedBuilding,
            x: worldPos.x,
            y: worldPos.y
        });
    }
    
    loadNearbyChunks() {
        const cameraChunk = this.getChunkCoords(this.camera.x + this.canvas.width / (2 * this.camera.scale), 
                                                this.camera.y + this.canvas.height / (2 * this.camera.scale));
        
        const neededChunks = [];
        
        for (let x = cameraChunk.x - this.chunkLoadRadius; x <= cameraChunk.x + this.chunkLoadRadius; x++) {
            for (let y = cameraChunk.y - this.chunkLoadRadius; y <= cameraChunk.y + this.chunkLoadRadius; y++) {
                const chunkKey = this.getChunkKey(x, y);
                if (!this.loadedChunks.has(chunkKey)) {
                    neededChunks.push({ x, y });
                }
            }
        }
        
        if (neededChunks.length > 0 && this.socket && this.isConnected) {
            this.socket.emit('request_chunks', {
                chunkCoords: neededChunks
            });
        }
        
        this.unloadDistantChunks(cameraChunk.x, cameraChunk.y);
    }
    
    getChunkCoords(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.chunkSize),
            y: Math.floor(worldY / this.chunkSize)
        };
    }
    
    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }
    
    generateChunk(chunkX, chunkY) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const worldX = chunkX * this.chunkSize;
        const worldY = chunkY * this.chunkSize;
        
        // Create chunk data structure
        const chunk = {
            x: chunkX,
            y: chunkY,
            worldX: worldX,
            worldY: worldY,
            tiles: [],
            textureCanvas: document.createElement('canvas'),
            detailCanvas: document.createElement('canvas'),
            generated: false
        };
        
        // Setup canvases
        chunk.textureCanvas.width = this.chunkSize;
        chunk.textureCanvas.height = this.chunkSize;
        chunk.textureCtx = chunk.textureCanvas.getContext('2d');
        
        chunk.detailCanvas.width = this.chunkSize;
        chunk.detailCanvas.height = this.chunkSize;
        chunk.detailCtx = chunk.detailCanvas.getContext('2d');
        
        // Generate tiles for this chunk
        this.generateChunkTerrain(chunk);
        
        // Render chunk textures
        this.renderChunkTextures(chunk);
        
        // Initialize fog of war for this chunk
        this.initializeChunkFogOfWar(chunkX, chunkY);
        
        // Store chunk
        this.loadedChunks.set(chunkKey, chunk);
        chunk.generated = true;
    }
    
    generateChunkTerrain(chunk) {
        const tilesPerChunk = this.chunkSize / this.tileSize;
        
        for (let tileX = 0; tileX < tilesPerChunk; tileX++) {
            for (let tileY = 0; tileY < tilesPerChunk; tileY++) {
                const worldTileX = chunk.worldX + (tileX * this.tileSize);
                const worldTileY = chunk.worldY + (tileY * this.tileSize);
                
                // Generate biome-based terrain
                const biomeData = this.getBiomeAt(worldTileX, worldTileY);
                const tileType = this.generateBiomeTerrain(worldTileX, worldTileY, biomeData);
                
                chunk.tiles.push({
                    localX: tileX * this.tileSize,
                    localY: tileY * this.tileSize,
                    worldX: worldTileX,
                    worldY: worldTileY,
                    type: tileType,
                    biome: biomeData.primary,
                    biomeStrength: biomeData.strength,
                    elevation: biomeData.elevation,
                    temperature: biomeData.temperature,
                    moisture: biomeData.moisture,
                    noise: this.seededNoise(worldTileX * 0.02, worldTileY * 0.02),
                    detailNoise: this.seededNoise(worldTileX * 0.05, worldTileY * 0.05)
                });
            }
        }
    }
    
    getBiomeAt(x, y) {
        // Generate multiple noise layers for biome determination
        const scale = 0.003; // Larger biomes
        const temperatureNoise = this.seededNoise(x * scale + this.seed, y * scale + this.seed);
        const moistureNoise = this.seededNoise(x * scale + this.seed + 1000, y * scale + this.seed + 1000);
        const elevationNoise = this.seededNoise(x * scale * 0.5 + this.seed + 2000, y * scale * 0.5 + this.seed + 2000);
        
        // Normalize to 0-1 range
        const temperature = (temperatureNoise + 1) * 0.5;
        const moisture = (moistureNoise + 1) * 0.5;
        const elevation = (elevationNoise + 1) * 0.5;
        
        // Determine primary biome based on temperature, moisture, and elevation
        let primaryBiome = 'temperate_plains';
        let biomeStrength = 1.0;
        
        // Arctic conditions (cold)
        if (temperature < 0.3) {
            primaryBiome = 'arctic_tundra';
        }
        // Cold forest conditions
        else if (temperature < 0.5 && moisture > 0.4) {
            primaryBiome = 'boreal_forest';
        }
        // Mountainous regions
        else if (elevation > 0.7) {
            primaryBiome = 'highland_mountains';
        }
        // Coastal areas (high moisture, moderate temperature)
        else if (moisture > 0.6 && temperature > 0.4 && temperature < 0.7) {
            primaryBiome = 'coastal_fjords';
        }
        // Default temperate plains
        else {
            primaryBiome = 'temperate_plains';
        }
        
        // Calculate transition zones between biomes
        const transitionNoise = this.seededNoise(x * 0.01 + this.seed + 3000, y * 0.01 + this.seed + 3000);
        biomeStrength = Math.max(0.3, Math.min(1.0, biomeStrength + transitionNoise * 0.3));
        
        return {
            primary: primaryBiome,
            strength: biomeStrength,
            temperature,
            moisture,
            elevation,
            transitionNoise
        };
    }
    
    generateBiomeTerrain(x, y, biomeData) {
        const detailNoise = this.seededNoise(x * 0.02 + this.seed, y * 0.02 + this.seed);
        const microNoise = this.seededNoise(x * 0.05 + this.seed + 500, y * 0.05 + this.seed + 500);
        
        // Base terrain generation based on biome
        switch (biomeData.primary) {
            case 'arctic_tundra':
                return this.generateArcticTerrain(biomeData, detailNoise, microNoise);
            
            case 'boreal_forest':
                return this.generateBorealTerrain(biomeData, detailNoise, microNoise);
            
            case 'coastal_fjords':
                return this.generateCoastalTerrain(biomeData, detailNoise, microNoise);
            
            case 'highland_mountains':
                return this.generateMountainTerrain(biomeData, detailNoise, microNoise);
            
            case 'temperate_plains':
            default:
                return this.generateTemperateTerrain(biomeData, detailNoise, microNoise);
        }
    }
    
    generateArcticTerrain(biomeData, detailNoise, microNoise) {
        // Arctic tundra: mostly snow, some ice, sparse vegetation
        if (biomeData.elevation < 0.2) {
            return detailNoise < -0.3 ? 'arctic_ice' : 'snow';
        } else if (biomeData.elevation < 0.4 && detailNoise > 0.2) {
            return 'tundra_grass';
        } else if (microNoise > 0.4 && biomeData.moisture > 0.3) {
            return 'sparse_forest';
        }
        return 'snow';
    }
    
    generateBorealTerrain(biomeData, detailNoise, microNoise) {
        // Boreal forest: dense coniferous forests, lakes, rocky areas
        if (biomeData.elevation < 0.15 && biomeData.moisture > 0.6) {
            return detailNoise < -0.2 ? 'boreal_lake' : 'wetland';
        } else if (biomeData.moisture > 0.4) {
            return detailNoise > 0.2 ? 'dense_conifer_forest' : 'conifer_forest';
        } else if (biomeData.elevation > 0.6) {
            return 'rocky_terrain';
        }
        return microNoise > 0 ? 'conifer_forest' : 'boreal_clearing';
    }
    
    generateCoastalTerrain(biomeData, detailNoise, microNoise) {
        // Coastal fjords: water bodies, beaches, coastal forests, cliffs
        if (biomeData.elevation < 0.1) {
            return 'deep_fjord_water';
        } else if (biomeData.elevation < 0.25) {
            return detailNoise < 0 ? 'shallow_water' : 'rocky_shore';
        } else if (biomeData.elevation < 0.4 && biomeData.moisture > 0.5) {
            return microNoise > 0.2 ? 'coastal_forest' : 'beach';
        } else if (biomeData.elevation > 0.7) {
            return 'sea_cliff';
        }
        return detailNoise > 0.1 ? 'coastal_grass' : 'beach';
    }
    
    generateMountainTerrain(biomeData, detailNoise, microNoise) {
        // Highland mountains: peaks, alpine meadows, rocky slopes
        if (biomeData.elevation > 0.9) {
            return biomeData.temperature < 0.3 ? 'snow_peak' : 'rocky_peak';
        } else if (biomeData.elevation > 0.7) {
            return detailNoise > 0.3 ? 'alpine_forest' : 'rocky_slope';
        } else if (biomeData.elevation > 0.5) {
            return microNoise > 0.2 ? 'mountain_forest' : 'alpine_meadow';
        } else if (biomeData.moisture > 0.6) {
            return 'mountain_stream';
        }
        return 'hills';
    }
    
    generateTemperateTerrain(biomeData, detailNoise, microNoise) {
        // Temperate plains: varied grasslands, deciduous forests, rivers
        if (biomeData.elevation < 0.15 && biomeData.moisture > 0.7) {
            return detailNoise < -0.2 ? 'river' : 'wetland';
        } else if (biomeData.moisture > 0.5 && detailNoise > 0.1) {
            return microNoise > 0.3 ? 'deciduous_forest' : 'mixed_forest';
        } else if (biomeData.moisture < 0.3 && detailNoise < -0.2) {
            return 'dry_grassland';
        } else if (microNoise > 0.4) {
            return 'flowering_meadow';
        }
        return 'grass';
    }
    
    seededNoise(x, y) {
        // Seeded multi-octave noise for consistent infinite generation
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        
        for (let i = 0; i < 3; i++) { // Reduced octaves for mobile performance
            const px = x * frequency;
            const py = y * frequency;
            
            // Simple seeded noise function
            const n = Math.sin(px * 2.3 + py * 1.7 + this.seed) * 
                     Math.cos(px * 1.9 + py * 2.1 + this.seed) * 
                     Math.sin(px * 3.1 + py * 2.9 + this.seed * 2);
            
            value += n * amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return Math.max(-1, Math.min(1, value * 0.5));
    }
    
    renderChunkTextures(chunk) {
        const ctx = chunk.textureCtx;
        const detailCtx = chunk.detailCtx;
        
        // Render base terrain
        chunk.tiles.forEach(tile => {
            this.drawEnhancedTerrainTile(ctx, tile.type, tile.localX, tile.localY, this.tileSize, tile.noise, tile.detailNoise, tile.moisture);
        });
        
        // Add detail overlay
        chunk.tiles.forEach(tile => {
            this.drawTerrainDetails(detailCtx, tile.type, tile.localX, tile.localY, this.tileSize, tile.detailNoise);
        });
    }
    
    drawEnhancedTerrainTile(ctx, tileType, x, y, size, noise, detailNoise, moisture) {
        switch(tileType) {
            // Arctic biome tiles
            case 'arctic_ice':
                this.drawArcticIceTile(ctx, x, y, size);
                break;
            case 'tundra_grass':
                this.drawTundraGrassTile(ctx, x, y, size, detailNoise);
                break;
            case 'sparse_forest':
                this.drawSparseForestTile(ctx, x, y, size, detailNoise);
                break;
                
            // Boreal biome tiles
            case 'boreal_lake':
                this.drawBorealLakeTile(ctx, x, y, size);
                break;
            case 'wetland':
                this.drawWetlandTile(ctx, x, y, size, moisture);
                break;
            case 'dense_conifer_forest':
                this.drawDenseConiferTile(ctx, x, y, size, detailNoise);
                break;
            case 'conifer_forest':
                this.drawConiferForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'boreal_clearing':
                this.drawBorealClearingTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_terrain':
                this.drawRockyTerrainTile(ctx, x, y, size, detailNoise);
                break;
                
            // Coastal biome tiles
            case 'deep_fjord_water':
                this.drawDeepFjordTile(ctx, x, y, size);
                break;
            case 'rocky_shore':
                this.drawRockyShoreTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_forest':
                this.drawCoastalForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'sea_cliff':
                this.drawSeaCliffTile(ctx, x, y, size, detailNoise);
                break;
            case 'coastal_grass':
                this.drawCoastalGrassTile(ctx, x, y, size, moisture);
                break;
                
            // Mountain biome tiles
            case 'snow_peak':
                this.drawSnowPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_peak':
                this.drawRockyPeakTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_forest':
                this.drawAlpineForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'rocky_slope':
                this.drawRockySlopeTile(ctx, x, y, size, detailNoise);
                break;
            case 'alpine_meadow':
                this.drawAlpineMeadowTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_forest':
                this.drawMountainForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mountain_stream':
                this.drawMountainStreamTile(ctx, x, y, size);
                break;
                
            // Temperate biome tiles
            case 'river':
                this.drawRiverTile(ctx, x, y, size);
                break;
            case 'deciduous_forest':
                this.drawDeciduousForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'mixed_forest':
                this.drawMixedForestTile(ctx, x, y, size, detailNoise);
                break;
            case 'dry_grassland':
                this.drawDryGrasslandTile(ctx, x, y, size, detailNoise);
                break;
            case 'flowering_meadow':
                this.drawFloweringMeadowTile(ctx, x, y, size, detailNoise);
                break;
                
            // Fallback tiles
            case 'grass':
                this.drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture || 0.5);
                break;
            case 'snow':
                this.drawEnhancedSnowTile(ctx, x, y, size, detailNoise);
                break;
            case 'hills':
                this.drawEnhancedHillsTile(ctx, x, y, size, detailNoise);
                break;
        }
    }
    
    // Arctic biome tile renderers (mobile optimized)
    drawArcticIceTile(ctx, x, y, size) {
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size/2);
        gradient.addColorStop(0, '#e8f4fd');
        gradient.addColorStop(1, '#b8daf2');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Ice crystals (simplified for mobile)
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 2; i++) {
            const crystalX = x + Math.random() * size;
            const crystalY = y + Math.random() * size;
            ctx.fillRect(crystalX, crystalY, 1, 1);
        }
    }
    
    drawTundraGrassTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#8fbc8f';
        ctx.fillRect(x, y, size, size);
        
        // Sparse grass tufts
        ctx.fillStyle = '#556b2f';
        for (let i = 0; i < 2; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 2);
        }
        
        // Moss patches
        if (detailNoise > 0.2) {
            ctx.fillStyle = '#9acd32';
            ctx.fillRect(x + size * 0.6, y + size * 0.4, 2, 2);
        }
    }
    
    drawSparseForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#8fbc8f';
        ctx.fillRect(x, y, size, size);
        
        // Single tree
        const treeX = x + size/2;
        const treeY = y + size/2;
        
        // Trunk
        ctx.fillStyle = '#654321';
        ctx.fillRect(treeX - 1, treeY, 1, 4);
        
        // Conifer canopy
        ctx.fillStyle = '#228b22';
        ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
    }
    
    // Boreal biome tile renderers
    drawBorealLakeTile(ctx, x, y, size) {
        const gradient = ctx.createRadialGradient(x + size/2, y + size/2, 0, x + size/2, y + size/2, size/2);
        gradient.addColorStop(0, '#4682b4');
        gradient.addColorStop(1, '#2f4f4f');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
    }
    
    drawWetlandTile(ctx, x, y, size, moisture) {
        ctx.fillStyle = moisture > 0.7 ? '#2e8b57' : '#6b8e23';
        ctx.fillRect(x, y, size, size);
        
        // Wetland vegetation
        ctx.fillStyle = '#228b22';
        for (let i = 0; i < 3; i++) {
            const reedX = x + Math.random() * size;
            const reedY = y + Math.random() * size;
            ctx.fillRect(reedX, reedY, 1, 3);
        }
    }
    
    drawDenseConiferTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#013220';
        ctx.fillRect(x, y, size, size);
        
        // Dense trees (simplified)
        for (let i = 0; i < 4; i++) {
            const treeX = x + (i % 2) * size/2 + 2;
            const treeY = y + Math.floor(i / 2) * size/2 + 2;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX, treeY, 1, 3);
            
            ctx.fillStyle = '#228b22';
            ctx.fillRect(treeX - 1, treeY - 2, 3, 3);
        }
    }
    
    drawConiferForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2d5016';
        ctx.fillRect(x, y, size, size);
        
        // Moderate trees
        for (let i = 0; i < 2; i++) {
            const treeX = x + i * size/2 + size/4;
            const treeY = y + size/2;
            
            ctx.fillStyle = '#654321';
            ctx.fillRect(treeX, treeY, 1, 4);
            
            ctx.fillStyle = '#228b22';
            ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
        }
    }
    
    drawBorealClearingTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#9acd32';
        ctx.fillRect(x, y, size, size);
        
        // Grass texture
        ctx.fillStyle = '#6b8e23';
        for (let i = 0; i < 6; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 1);
        }
    }
    
    drawRockyTerrainTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#708090';
        ctx.fillRect(x, y, size, size);
        
        // Rocky outcrops
        ctx.fillStyle = '#2f4f4f';
        for (let i = 0; i < 3; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.fillRect(rockX, rockY, 2, 2);
        }
    }
    
    // Coastal biome tile renderers
    drawDeepFjordTile(ctx, x, y, size) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#191970');
        gradient.addColorStop(1, '#0000cd');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
    }
    
    drawRockyShoreTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#696969';
        ctx.fillRect(x, y, size, size);
        
        // Rocky shore elements
        ctx.fillStyle = '#2f4f4f';
        for (let i = 0; i < 3; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.fillRect(rockX, rockY, 2, 2);
        }
    }
    
    drawCoastalForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(x, y, size, size);
        
        // Coastal trees
        const treeX = x + size/2;
        const treeY = y + size/2;
        
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(treeX, treeY, 1, 4);
        
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
    }
    
    drawSeaCliffTile(ctx, x, y, size, detailNoise) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#d3d3d3');
        gradient.addColorStop(1, '#696969');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Cliff lines
        ctx.strokeStyle = '#2f4f4f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + size/2);
        ctx.lineTo(x + size, y + size/2 + 2);
        ctx.stroke();
    }
    
    drawCoastalGrassTile(ctx, x, y, size, moisture) {
        const grassColor = moisture > 0.6 ? '#32cd32' : '#9acd32';
        ctx.fillStyle = grassColor;
        ctx.fillRect(x, y, size, size);
        
        // Coastal grass
        ctx.fillStyle = '#6b8e23';
        for (let i = 0; i < 8; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 1);
        }
    }
    
    // Mountain biome tile renderers
    drawSnowPeakTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#fffafa';
        ctx.fillRect(x, y, size, size);
        
        // Snow drifts
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) {
            const driftX = x + Math.random() * size;
            const driftY = y + Math.random() * size;
            ctx.fillRect(driftX, driftY, 2, 1);
        }
    }
    
    drawRockyPeakTile(ctx, x, y, size, detailNoise) {
        const gradient = ctx.createLinearGradient(x, y, x, y + size);
        gradient.addColorStop(0, '#dcdcdc');
        gradient.addColorStop(1, '#696969');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Rocky formations
        ctx.fillStyle = '#2f4f4f';
        ctx.fillRect(x + size/4, y, size/2, size/3);
    }
    
    drawAlpineForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2f4f2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine tree
        const treeX = x + size/2;
        const treeY = y + size/2;
        
        ctx.fillStyle = '#654321';
        ctx.fillRect(treeX, treeY, 1, 3);
        
        ctx.fillStyle = '#006400';
        ctx.fillRect(treeX - 1, treeY - 2, 3, 3);
    }
    
    drawRockySlopeTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#a9a9a9';
        ctx.fillRect(x, y, size, size);
        
        // Sloped rocks
        ctx.fillStyle = '#696969';
        for (let i = 0; i < 4; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.fillRect(rockX, rockY, 2, 1);
        }
    }
    
    drawAlpineMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#adff2f';
        ctx.fillRect(x, y, size, size);
        
        // Alpine flowers
        const colors = ['#ff1493', '#ffd700', '#ff69b4'];
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = colors[i % colors.length];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.fillRect(flowerX, flowerY, 1, 1);
        }
    }
    
    drawMountainForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Mountain tree
        const treeX = x + size/2;
        const treeY = y + size/2;
        
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(treeX, treeY, 1, 4);
        
        ctx.fillStyle = '#006400';
        ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
    }
    
    drawMountainStreamTile(ctx, x, y, size) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Stream
        ctx.strokeStyle = '#87ceeb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + size/4);
        ctx.lineTo(x + size, y + 3*size/4);
        ctx.stroke();
    }
    
    // Temperate biome tile renderers
    drawRiverTile(ctx, x, y, size) {
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(x, y, size, size);
        
        // River
        ctx.strokeStyle = '#4169e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + size/3);
        ctx.lineTo(x + size, y + 2*size/3);
        ctx.stroke();
    }
    
    drawDeciduousForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#228b22';
        ctx.fillRect(x, y, size, size);
        
        // Deciduous trees
        for (let i = 0; i < 2; i++) {
            const treeX = x + i * size/2 + size/4;
            const treeY = y + size/2;
            
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(treeX, treeY, 1, 4);
            
            ctx.fillStyle = '#32cd32';
            ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
        }
    }
    
    drawMixedForestTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(x, y, size, size);
        
        // Mixed trees
        const treeX = x + size/2;
        const treeY = y + size/2;
        
        ctx.fillStyle = '#654321';
        ctx.fillRect(treeX, treeY, 1, 4);
        
        if (Math.random() > 0.5) {
            ctx.fillStyle = '#228b22';
            ctx.fillRect(treeX - 1, treeY - 3, 3, 4);
        } else {
            ctx.fillStyle = '#32cd32';
            ctx.fillRect(treeX - 2, treeY - 3, 4, 4);
        }
    }
    
    drawDryGrasslandTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#daa520';
        ctx.fillRect(x, y, size, size);
        
        // Dry grass
        ctx.fillStyle = '#b8860b';
        for (let i = 0; i < 10; i++) {
            const grassX = x + Math.random() * size;
            const grassY = y + Math.random() * size;
            ctx.fillRect(grassX, grassY, 1, 1);
        }
    }
    
    drawFloweringMeadowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#90ee90';
        ctx.fillRect(x, y, size, size);
        
        // Wildflowers
        const flowers = ['#ff1493', '#ffd700', '#ff69b4'];
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = flowers[Math.floor(Math.random() * flowers.length)];
            const flowerX = x + Math.random() * size;
            const flowerY = y + Math.random() * size;
            ctx.fillRect(flowerX, flowerY, 1, 1);
        }
    }
    
    drawEnhancedGrassTile(ctx, x, y, size, detailNoise, moisture) {
        const baseGreen = moisture > 0 ? '#4caf50' : '#7cb342';
        ctx.fillStyle = baseGreen;
        ctx.fillRect(x, y, size, size);
        
        // Grass texture
        ctx.fillStyle = '#388e3c';
        for (let i = 0; i < 4; i++) {
            const patchX = x + Math.random() * size;
            const patchY = y + Math.random() * size;
            ctx.fillRect(patchX, patchY, 1, 1);
        }
    }
    
    drawEnhancedSnowTile(ctx, x, y, size, detailNoise) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, size, size);
        
        // Snow sparkles
        ctx.fillStyle = '#f0f0f0';
        for (let i = 0; i < 6; i++) {
            const sparkleX = x + Math.random() * size;
            const sparkleY = y + Math.random() * size;
            ctx.fillRect(sparkleX, sparkleY, 1, 1);
        }
    }
    
    drawEnhancedHillsTile(ctx, x, y, size, detailNoise) {
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, '#8d6e63');
        gradient.addColorStop(1, '#6d4c41');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
        
        // Hill texture
        ctx.fillStyle = '#795548';
        for (let i = 0; i < 3; i++) {
            const rockX = x + Math.random() * size;
            const rockY = y + Math.random() * size;
            ctx.fillRect(rockX, rockY, 2, 1);
        }
    }
    
    drawTerrainDetails(ctx, tileType, x, y, size, detailNoise) {
        ctx.globalAlpha = 0.4;
        
        // Add ambient details based on terrain type
        switch(tileType) {
            case 'grass':
                if (Math.random() < 0.3) {
                    ctx.fillStyle = '#2e7d32';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 1, 1);
                }
                break;
            case 'conifer_forest':
            case 'dense_conifer_forest':
                if (Math.random() < 0.2) {
                    ctx.fillStyle = '#3e2723';
                    ctx.fillRect(x + Math.random() * size, y + Math.random() * size, 1, 2);
                }
                break;
        }
        
        ctx.globalAlpha = 1;
    }
    
    unloadDistantChunks(centerChunkX, centerChunkY) {
        const unloadDistance = this.chunkLoadRadius + 1;
        const chunksToUnload = [];
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            const distance = Math.max(
                Math.abs(chunk.x - centerChunkX),
                Math.abs(chunk.y - centerChunkY)
            );
            
            if (distance > unloadDistance) {
                chunksToUnload.push(chunkKey);
            }
        }
        
        // Unload chunks
        chunksToUnload.forEach(chunkKey => {
            this.loadedChunks.delete(chunkKey);
            this.fogOfWar.delete(chunkKey);
        });
    }
    
    initializeChunkFogOfWar(chunkX, chunkY) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        
        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = this.chunkSize;
        fogCanvas.height = this.chunkSize;
        const fogCtx = fogCanvas.getContext('2d');
        
        fogCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        fogCtx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        
        this.fogOfWar.set(chunkKey, { canvas: fogCanvas, ctx: fogCtx });
    }
    
    spawnInitialScout() {
        const scout = {
            x: this.camera.x + this.canvas.width / (2 * this.camera.scale),
            y: this.camera.y + this.canvas.height / (2 * this.camera.scale),
            speed: 20,
            target: null,
            exploring: false,
            health: 100,
            range: 40
        };
        
        this.scouts.push(scout);
        this.revealArea(scout.x, scout.y, 60);
    }
    
    revealArea(x, y, radius) {
        const chunkCoords = this.getChunkCoords(x, y);
        const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
        const fogData = this.fogOfWar.get(chunkKey);
        
        if (!fogData) return;
        
        this.revealAnimations.push({
            x, y, radius: 0, targetRadius: radius,
            startTime: Date.now(),
            duration: 800,
            chunkX: chunkCoords.x,
            chunkY: chunkCoords.y
        });
    }
    
    resetGameProgress() {
        try {
            this.resources = { food: 100, wood: 50, iron: 25, gold: 10 };
            this.population = 5;
            this.buildings = [];
            this.camera = { x: 0, y: 0, scale: 1 };
            this.scouts = [];
            this.exploredAreas.clear();
            this.revealAnimations = [];
            this.loadedChunks.clear();
            this.fogOfWar.clear();
            this.seed = Math.random() * 10000;
            
            this.loadNearbyChunks();
            this.spawnInitialScout();
            
            this.updateMobileResourceDisplay();
            this.updateMobilePopulationDisplay();
            this.updateMobileStatsDisplay();
            
            this.cancelMobilePlacement();
            
            // Clear mobile save data
            localStorage.removeItem('vikingSettlementMobile');
        } catch (error) {
            console.error('Failed to reset mobile game:', error);
            this.showMobileNotification('Reset failed, please refresh', 'error');
        }
    }
    
    restoreFogOfWar() {
        // Simplified fog restoration for mobile
        for (const areaKey of this.exploredAreas) {
            const [tileX, tileY] = areaKey.split(',').map(Number);
            this.revealArea(tileX, tileY, 30);
        }
    }
    
    saveFogOfWarToServer() {
        if (this.socket && this.isConnected) {
            const fogOfWarData = {};
            for (const [chunkKey, fogData] of this.fogOfWar) {
                fogOfWarData[chunkKey] = fogData.canvas.toDataURL();
            }
            
            this.socket.emit('save_fog_of_war', {
                fogOfWarData: fogOfWarData,
                exploredAreas: Array.from(this.exploredAreas)
            });
        }
    }
    
    restoreFogOfWarFromServer(fogOfWarData) {
        try {
            for (const [chunkKey, dataURL] of Object.entries(fogOfWarData)) {
                const img = new Image();
                img.onload = () => {
                    let fogData = this.fogOfWar.get(chunkKey);
                    if (!fogData) {
                        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
                        this.initializeChunkFogOfWar(chunkX, chunkY);
                        fogData = this.fogOfWar.get(chunkKey);
                    }
                    
                    if (fogData) {
                        fogData.ctx.clearRect(0, 0, this.chunkSize, this.chunkSize);
                        fogData.ctx.drawImage(img, 0, 0);
                    }
                };
                img.src = dataURL;
            }
        } catch (error) {
            console.error('Mobile failed to restore fog of war:', error);
        }
    }
    
    getBuildingData(type) {
        const buildings = {
            longhouse: {
                name: 'Longhouse',
                icon: '🏘️',
                cost: { wood: 20, food: 10 },
                produces: { population: 3 },
                size: 32
            },
            farm: {
                name: 'Farm',
                icon: '🌾',
                cost: { wood: 15 },
                produces: { food: 2 },
                size: 28
            },
            lumbermill: {
                name: 'Lumber Mill',
                icon: '🪓',
                cost: { wood: 25, iron: 5 },
                produces: { wood: 3 },
                size: 30
            },
            blacksmith: {
                name: 'Blacksmith',
                icon: '⚒️',
                cost: { wood: 30, iron: 10 },
                produces: { iron: 2 },
                size: 26
            },
            tradingpost: {
                name: 'Trading Post',
                icon: '⛵',
                cost: { wood: 40, gold: 5 },
                produces: { gold: 1 },
                size: 30
            },
            temple: {
                name: 'Temple',
                icon: '⚡',
                cost: { wood: 50, iron: 20, gold: 15 },
                produces: { happiness: 10 },
                size: 36
            }
        };
        
        return buildings[type];
    }
    
    canAfford(cost) {
        for (const [resource, amount] of Object.entries(cost)) {
            if (this.resources[resource] < amount) {
                return false;
            }
        }
        return true;
    }
    
    spendResources(cost) {
        for (const [resource, amount] of Object.entries(cost)) {
            this.resources[resource] -= amount;
        }
        this.updateMobileResourceDisplay();
    }
    
    addBuilding(type, x, y) {
        const buildingData = this.getBuildingData(type);
        if (!buildingData) return;
        
        const building = {
            type,
            x,
            y,
            ...buildingData,
            level: 1,
            production: 0,
            lastUpdate: Date.now()
        };
        
        this.buildings.push(building);
        this.updateMobileStatsDisplay();
    }
    
    isValidPlacement(x, y) {
        // Simplified validation for mobile
        for (const building of this.buildings) {
            const distance = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (distance < building.size) {
                return false;
            }
        }
        return true;
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.camera.scale) + this.camera.x,
            y: (screenY / this.camera.scale) + this.camera.y
        };
    }
    
    update(deltaTime) {
        this.loadNearbyChunks();
        this.updateRevealAnimations();
        
        // Save fog of war periodically
        if (Math.random() < 0.01) {
            this.saveFogOfWarToServer();
        }
        
        this.updateMobileResourceDisplay();
        this.updateMobilePopulationDisplay();
    }
    
    updateRevealAnimations() {
        const now = Date.now();
        
        this.revealAnimations = this.revealAnimations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
            
            anim.radius = anim.targetRadius * this.easeOutQuad(progress);
            
            const chunkKey = this.getChunkKey(anim.chunkX, anim.chunkY);
            const fogData = this.fogOfWar.get(chunkKey);
            const chunk = this.loadedChunks.get(chunkKey);
            
            if (fogData && chunk && isFinite(anim.radius) && anim.radius > 0) {
                const ctx = fogData.ctx;
                const localX = anim.x - chunk.worldX;
                const localY = anim.y - chunk.worldY;
                
                if (isFinite(localX) && isFinite(localY) && isFinite(anim.radius)) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-out';
                    
                    const gradient = ctx.createRadialGradient(localX, localY, 0, localX, localY, anim.radius);
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(localX, localY, anim.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            
            return progress < 1;
        });
    }
    
    easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.scale(this.camera.scale, this.camera.scale);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        this.renderTerrain();
        this.renderBuildings();
        this.renderScouts();
        this.renderMobileOtherPlayers();
        this.renderFogOfWar();
        
        this.ctx.restore();
        
        this.renderMobileMultiplayerUI();
    }
    
    renderTerrain() {
        const viewBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            if (chunk.worldX + this.chunkSize < viewBounds.left || 
                chunk.worldX > viewBounds.right ||
                chunk.worldY + this.chunkSize < viewBounds.top || 
                chunk.worldY > viewBounds.bottom) {
                continue;
            }
            
            // Draw base terrain
            this.ctx.drawImage(chunk.textureCanvas, chunk.worldX, chunk.worldY);
            
            // Draw detail overlay with reduced opacity for mobile performance
            this.ctx.globalAlpha = 0.4;
            this.ctx.drawImage(chunk.detailCanvas, chunk.worldX, chunk.worldY);
            this.ctx.globalAlpha = 1;
        }
    }
    
    renderBuildings() {
        this.buildings.forEach(building => {
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(building.x + 2, building.y + 2, building.size, building.size);
            
            this.ctx.fillStyle = '#8b4513';
            this.ctx.fillRect(building.x, building.y, building.size, building.size);
            
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.font = `${building.size * 0.6}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                building.icon,
                building.x + building.size / 2,
                building.y + building.size * 0.7
            );
        });
    }
    
    renderScouts() {
        this.scouts.forEach(scout => {
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(scout.x + 1, scout.y + 1, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = scout.exploring ? '#ff5722' : '#2196f3';
            this.ctx.beginPath();
            this.ctx.arc(scout.x, scout.y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('👤', scout.x, scout.y + 3);
        });
    }
    
    renderMobileOtherPlayers() {
        // Render other players with mobile-optimized indicators
        for (const [playerId, player] of this.otherPlayers) {
            if (player.camera) {
                const screenPos = this.worldToScreen(
                    player.camera.x + 200 / (2 * player.camera.scale),
                    player.camera.y + 150 / (2 * player.camera.scale)
                );
                
                this.ctx.fillStyle = 'rgba(255, 152, 0, 0.8)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 8, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '12px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('🛡️', screenPos.x, screenPos.y + 4);
            }
        }
    }
    
    renderMobileMultiplayerUI() {
        // Mobile connection status overlay
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        const statusColor = this.isConnected ? '#4caf50' : '#f44336';
        const statusIcon = this.isConnected ? '●' : '○';
        
        // Small status indicator in top right
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(this.canvas.width - 80, 10, 70, 25);
        
        this.ctx.fillStyle = statusColor;
        this.ctx.font = '12px Space Mono';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${statusIcon} ${this.otherPlayers.size + 1}P`, this.canvas.width - 45, 27);
        
        this.ctx.restore();
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.camera.scale - this.camera.x,
            y: worldY * this.camera.scale - this.camera.y
        };
    }
    
    getTileAt(x, y) {
        const chunkCoords = this.getChunkCoords(x, y);
        const chunkKey = this.getChunkKey(chunkCoords.x, chunkCoords.y);
        const chunk = this.loadedChunks.get(chunkKey);
        
        if (!chunk) return 'grass'; // Default for unloaded chunks
        
        const localX = x - chunk.worldX;
        const localY = y - chunk.worldY;
        const tileX = Math.floor(localX / this.tileSize) * this.tileSize;
        const tileY = Math.floor(localY / this.tileSize) * this.tileSize;
        
        const tile = chunk.tiles.find(t => t.localX === tileX && t.localY === tileY);
        return tile ? tile.type : 'grass';
    }
    
    gameLoop() {
        const now = performance.now();
        const deltaTime = now - this.lastUpdate;
        
        if (this.gameRunning) {
            this.update(deltaTime);
            this.render();
        }
        
        this.lastUpdate = now;
        requestAnimationFrame(() => this.gameLoop());
    }
    
    // Utility function for throttling
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
}

// Start the mobile game when page loads
window.addEventListener('load', () => {
    const game = new MobileVikingSettlementTycoon();
    
    // Auto-save every 2 minutes
    setInterval(() => {
        game.saveMobileGame();
    }, 120000);
    
    // Try to load saved game after initialization
    setTimeout(() => {
        game.loadGame();
    }, 100);
});

// Handle visibility change to pause/resume game
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Game will continue running but at reduced performance when hidden
        console.log('Game backgrounded - reducing performance');
    } else {
        console.log('Game foregrounded - restoring performance');
    }
});