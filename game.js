class VikingSettlementTycoon {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Multiplayer setup
        this.socket = null;
        this.worldId = null;
        this.isMultiplayer = true;
        this.otherPlayers = new Map(); // playerId -> player data
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
        
        // Infinite terrain system
        this.chunkSize = 512; // Size of each chunk in pixels
        this.tileSize = 32;
        this.loadedChunks = new Map(); // Map of chunk coordinates to chunk data
        this.chunkLoadRadius = 3; // How many chunks to load around camera
        this.seed = Math.random() * 10000; // Seed for consistent generation
        
        // Exploration system
        this.fogOfWar = new Map(); // Map of chunk coordinates to fog canvas
        this.scouts = [];
        this.exploredAreas = new Set();
        this.revealAnimations = [];
        
        // Mouse/Touch handling
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraStart = { x: 0, y: 0 };
        
        // Game loop
        this.lastUpdate = 0;
        this.gameRunning = true;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.connectToServer();
        this.setupEventListeners();
        this.setupUI();
        this.gameLoop();
    }
    
    connectToServer() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to multiplayer server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.showNotification('Connected to multiplayer server!', 'success');
                
                // Join world
                this.joinWorld();
            });
            
            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
                this.showNotification('Disconnected from server', 'warning');
                this.attemptReconnect();
            });
            
            this.socket.on('world_joined', (data) => {
                this.handleWorldJoined(data);
            });
            
            this.socket.on('player_joined', (data) => {
                this.handlePlayerJoined(data);
            });
            
            this.socket.on('player_left', (data) => {
                this.handlePlayerLeft(data);
            });
            
            this.socket.on('building_placed', (data) => {
                this.handleBuildingPlaced(data);
            });
            
            this.socket.on('building_rejected', (data) => {
                this.handleBuildingRejected(data);
            });
            
            this.socket.on('scout_sent', (data) => {
                this.handleScoutSent(data);
            });
            
            this.socket.on('scout_rejected', (data) => {
                this.handleScoutRejected(data);
            });
            
            this.socket.on('player_updated', (data) => {
                this.handlePlayerUpdated(data);
            });
            
            this.socket.on('player_camera_updated', (data) => {
                this.handlePlayerCameraUpdated(data);
            });
            
            this.socket.on('chunks_data', (data) => {
                this.handleChunksData(data);
            });
            
            this.socket.on('area_explored', (data) => {
                this.handleAreaExplored(data);
            });
            
            this.socket.on('error', (data) => {
                console.error('Server error:', data.message);
                this.showNotification(data.message, 'error');
            });
            
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.showNotification('Failed to connect to multiplayer server', 'error');
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            
            setTimeout(() => {
                console.log(`Reconnection attempt ${this.reconnectAttempts}`);
                this.connectToServer();
            }, delay);
        } else {
            this.showNotification('Unable to reconnect. Please refresh the page.', 'error');
        }
    }
    
    joinWorld(worldId = null) {
        if (this.socket && this.isConnected) {
            this.socket.emit('join_world', {
                worldId: worldId,
                playerName: localStorage.getItem('playerName') || 'Viking Player'
            });
        }
    }
    
    handleWorldJoined(data) {
        const { worldId, playerData, worldData, otherPlayers } = data;
        
        this.worldId = worldId;
        
        // Load player data
        this.resources = playerData.resources || this.resources;
        this.population = playerData.population || this.population;
        this.buildings = playerData.buildings || this.buildings;
        this.scouts = playerData.scouts || this.scouts;
        this.camera = playerData.camera || this.camera;
        
        if (playerData.explored_areas) {
            this.exploredAreas = new Set(playerData.explored_areas);
        }
        
        // Load other players
        this.otherPlayers.clear();
        otherPlayers.forEach(player => {
            this.otherPlayers.set(player.socket_id, player);
        });
        
        // Initialize fog of war from saved data
        if (playerData.fog_of_war) {
            this.restoreFogOfWarFromServer(playerData.fog_of_war);
        }
        
        this.loadNearbyChunks();
        this.updateResourceDisplay();
        this.updatePopulationDisplay();
        this.updateStatsDisplay();
        
        this.showNotification(`Joined world ${worldId} with ${otherPlayers.length} other players!`, 'success');
    }
    
    handlePlayerJoined(data) {
        const { socketId, playerName, camera } = data;
        this.otherPlayers.set(socketId, {
            socket_id: socketId,
            player_name: playerName,
            camera: camera
        });
        this.showNotification(`${playerName} joined the world!`, 'info');
    }
    
    handlePlayerLeft(data) {
        const { playerId } = data;
        const player = this.otherPlayers.get(playerId);
        if (player) {
            this.otherPlayers.delete(playerId);
            this.showNotification(`${player.player_name} left the world`, 'info');
        }
    }
    
    handleBuildingPlaced(data) {
        const { playerId, building, playerResources } = data;
        
        if (playerId === this.socket.id) {
            // Update own resources
            this.resources = playerResources;
            this.updateResourceDisplay();
            this.cancelPlacement();
        } else {
            // Add other player's building to render list
            this.buildings.push(building);
        }
        
        this.showNotification(`${building.name} built!`, 'success');
    }
    
    handleBuildingRejected(data) {
        const { reason } = data;
        this.showNotification(reason, 'error');
        this.cancelPlacement();
    }
    
    handleScoutSent(data) {
        const { playerId, scout } = data;
        
        if (playerId === this.socket.id) {
            // Update own scout
            const myScout = this.scouts.find(s => s.id === scout.id);
            if (myScout) {
                Object.assign(myScout, scout);
            }
        }
        
        this.showNotification('Scout dispatched!', 'success');
    }
    
    handleScoutRejected(data) {
        const { reason } = data;
        this.showNotification(reason, 'warning');
    }
    
    handlePlayerUpdated(data) {
        const { playerId, resources, population, scouts } = data;
        
        if (playerId === this.socket.id) {
            // Update own data
            if (resources) this.resources = resources;
            if (population) this.population = population;
            if (scouts) this.scouts = scouts;
            
            this.updateResourceDisplay();
            this.updatePopulationDisplay();
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
                textureCanvas: this.createChunkCanvas(chunk),
                detailCanvas: this.createChunkDetailCanvas(chunk)
            });
            
            // Initialize fog of war for this chunk if not exists
            if (!this.fogOfWar.has(chunkKey)) {
                this.initializeChunkFogOfWar(chunk.x, chunk.y);
            }
        });
    }
    
    handleAreaExplored(data) {
        const { scoutId, x, y, range } = data;
        this.revealArea(x, y, range);
        this.showNotification('Area explored!', 'success');
        
        // Save fog of war periodically
        this.saveFogOfWarToServer();
    }
    
    setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight - 80; // Account for top UI
        };
        
        resize();
        window.addEventListener('resize', resize);
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
    
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Keyboard events
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Building selection
        document.querySelectorAll('.building-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const buildingType = card.dataset.building;
                this.selectBuilding(buildingType);
            });
        });
        
        // Action buttons - Updated for multiplayer
        document.getElementById('generateMapBtn').addEventListener('click', () => {
            // In multiplayer, this creates a new world
            this.createNewWorld();
        });
        
        document.getElementById('saveGameBtn').addEventListener('click', () => {
            // In multiplayer, this saves to server automatically
            this.showNotification('Game saved to server!', 'success');
        });
    }
    
    createNewWorld() {
        if (this.socket && this.isConnected) {
            // Disconnect from current world and join a new one
            this.socket.disconnect();
            setTimeout(() => {
                this.connectToServer();
            }, 1000);
        }
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.placementMode && this.selectedBuilding) {
            this.tryPlaceBuilding(x, y);
        } else if (e.button === 2) { // Right click to send scout
            const worldPos = this.screenToWorld(x, y);
            this.sendScoutToExplore(worldPos.x, worldPos.y);
        } else {
            this.isDragging = true;
            this.dragStart = { x, y };
            this.cameraStart = { x: this.camera.x, y: this.camera.y };
        }
    }
    
    sendScoutToExplore(x, y) {
        if (this.socket && this.isConnected) {
            this.socket.emit('send_scout', {
                targetX: x,
                targetY: y
            });
        } else {
            this.showNotification('Not connected to server!', 'error');
        }
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;
        
        this.camera.x = this.cameraStart.x - dx;
        this.camera.y = this.cameraStart.y - dy;
        
        // Send camera update to server (throttled)
        this.throttledCameraUpdate();
    }
    
    throttledCameraUpdate = this.throttle(() => {
        if (this.socket && this.isConnected) {
            this.socket.emit('update_camera', {
                camera: this.camera
            });
        }
    }, 100); // Update every 100ms
    
    handleMouseUp(e) {
        this.isDragging = false;
    }
    
    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.scale = Math.max(0.3, Math.min(2, this.camera.scale * zoomFactor));
    }
    
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchEnd(e) {
        this.handleMouseUp(e);
    }
    
    handleKeyDown(e) {
        const speed = 50;
        switch(e.key.toLowerCase()) {
            case 'w': this.camera.y -= speed; break;
            case 's': this.camera.y += speed; break;
            case 'a': this.camera.x -= speed; break;
            case 'd': this.camera.x += speed; break;
            case 'escape':
                this.cancelPlacement();
                break;
        }
    }
    
    selectBuilding(buildingType) {
        this.selectedBuilding = buildingType;
        this.placementMode = true;
        
        // Update UI
        document.querySelectorAll('.building-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelector(`[data-building="${buildingType}"]`).classList.add('selected');
        
        this.showNotification(`Click on the map to place ${buildingType}`, 'success');
    }
    
    tryPlaceBuilding(screenX, screenY) {
        if (!this.socket || !this.isConnected) {
            this.showNotification('Not connected to server!', 'error');
            return;
        }
        
        const worldPos = this.screenToWorld(screenX, screenY);
        
        // Send to server for validation and placement
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
        
        // Determine which chunks we need
        for (let x = cameraChunk.x - this.chunkLoadRadius; x <= cameraChunk.x + this.chunkLoadRadius; x++) {
            for (let y = cameraChunk.y - this.chunkLoadRadius; y <= cameraChunk.y + this.chunkLoadRadius; y++) {
                const chunkKey = this.getChunkKey(x, y);
                if (!this.loadedChunks.has(chunkKey)) {
                    neededChunks.push({ x, y });
                }
            }
        }
        
        // Request chunks from server
        if (neededChunks.length > 0 && this.socket && this.isConnected) {
            this.socket.emit('request_chunks', {
                chunkCoords: neededChunks
            });
        }
        
        // Unload distant chunks to save memory
        this.unloadDistantChunks(cameraChunk.x, cameraChunk.y);
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
    
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.camera.scale) + this.camera.x,
            y: (screenY / this.camera.scale) + this.camera.y
        };
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.camera.x) * this.camera.scale,
            y: (worldY - this.camera.y) * this.camera.scale
        };
    }
    
    saveFogOfWarToServer() {
        if (this.socket && this.isConnected) {
            // Convert fog of war to serializable format
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
            console.error('Failed to restore fog of war:', error);
        }
    }
    
    setupUI() {
        this.updateResourceDisplay();
        this.updatePopulationDisplay();
        this.updateStatsDisplay();
    }
    
    update(deltaTime) {
        // Load nearby chunks based on camera position
        this.loadNearbyChunks();
        
        // Update reveal animations
        this.updateRevealAnimations();
        
        // Save fog of war periodically
        if (Math.random() < 0.01) { // 1% chance per frame
            this.saveFogOfWarToServer();
        }
        
        this.updateResourceDisplay();
        this.updatePopulationDisplay();
    }
    
    updateRevealAnimations() {
        const now = Date.now();
        
        this.revealAnimations = this.revealAnimations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
            
            anim.radius = anim.targetRadius * this.easeOutQuad(progress);
            
            // Get fog data for the animation's chunk
            const chunkKey = this.getChunkKey(anim.chunkX, anim.chunkY);
            const fogData = this.fogOfWar.get(chunkKey);
            const chunk = this.loadedChunks.get(chunkKey);
            
            if (fogData && chunk && isFinite(anim.radius) && anim.radius > 0) {
                const ctx = fogData.ctx;
                const localX = anim.x - chunk.worldX;
                const localY = anim.y - chunk.worldY;
                
                // Ensure all values are finite before creating gradient
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
        
        // Render enhanced terrain
        this.renderEnhancedTerrain();
        
        // Render buildings (all players)
        this.renderBuildings();
        
        // Render scouts
        this.renderScouts();
        
        // Render other players
        this.renderOtherPlayers();
        
        // Render fog of war
        this.renderFogOfWar();
        
        this.ctx.restore();
        
        // Render multiplayer UI
        this.renderMultiplayerUI();
    }
    
    renderEnhancedTerrain() {
        // Render only visible chunks
        const viewBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            // Check if chunk is visible
            if (chunk.worldX + this.chunkSize < viewBounds.left || 
                chunk.worldX > viewBounds.right ||
                chunk.worldY + this.chunkSize < viewBounds.top || 
                chunk.worldY > viewBounds.bottom) {
                continue;
            }
            
            // Draw base terrain
            this.ctx.drawImage(
                chunk.textureCanvas,
                chunk.worldX, chunk.worldY
            );
            
            // Draw detail overlay
            this.ctx.globalAlpha = 0.6;
            this.ctx.drawImage(
                chunk.detailCanvas,
                chunk.worldX, chunk.worldY
            );
            this.ctx.globalAlpha = 1;
        }
    }
    
    renderBuildings() {
        // Render all buildings (including other players')
        this.buildings.forEach(building => {
            const screenPos = { x: building.x, y: building.y };
            
            // Building shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(screenPos.x + 3, screenPos.y + 3, building.size, building.size);
            
            // Building base - different color for other players
            if (building.playerId && building.playerId !== this.socket.id) {
                this.ctx.fillStyle = '#6d4c41'; // Darker brown for other players
            } else {
                this.ctx.fillStyle = '#8b4513';
            }
            this.ctx.fillRect(screenPos.x, screenPos.y, building.size, building.size);
            
            // Building icon
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.font = `${building.size * 0.6}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                building.icon,
                screenPos.x + building.size / 2,
                screenPos.y + building.size * 0.7
            );
            
            // Player indicator for other players
            if (building.playerId && building.playerId !== this.socket.id) {
                this.ctx.fillStyle = '#ff9800';
                this.ctx.font = '8px Arial';
                this.ctx.fillText('●', screenPos.x + building.size - 4, screenPos.y + 8);
            }
        });
    }
    
    renderOtherPlayers() {
        // Render other players' camera positions as indicators
        for (const [playerId, player] of this.otherPlayers) {
            if (player.camera) {
                const screenPos = this.worldToScreen(
                    player.camera.x + 400 / (2 * player.camera.scale), // Approximate center
                    player.camera.y + 300 / (2 * player.camera.scale)
                );
                
                // Player indicator
                this.ctx.fillStyle = 'rgba(255, 152, 0, 0.7)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 12, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Player name
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '10px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    player.player_name || 'Player',
                    screenPos.x,
                    screenPos.y - 15
                );
                
                // Viking icon
                this.ctx.font = '16px Arial';
                this.ctx.fillText('🛡️', screenPos.x, screenPos.y + 5);
            }
        }
    }
    
    renderScouts() {
        this.scouts.forEach(scout => {
            // Scout shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.beginPath();
            this.ctx.arc(scout.x + 2, scout.y + 2, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Scout body
            this.ctx.fillStyle = scout.exploring ? '#ff5722' : '#2196f3';
            this.ctx.beginPath();
            this.ctx.arc(scout.x, scout.y, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Scout direction indicator
            if (scout.target) {
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([3, 3]);
                this.ctx.beginPath();
                this.ctx.moveTo(scout.x, scout.y);
                this.ctx.lineTo(scout.target.x, scout.target.y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Scout icon
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🚶', scout.x, scout.y + 4);
        });
    }
    
    renderFogOfWar() {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Render fog for visible chunks
        const viewBounds = {
            left: this.camera.x,
            right: this.camera.x + this.canvas.width / this.camera.scale,
            top: this.camera.y,
            bottom: this.camera.y + this.canvas.height / this.camera.scale
        };
        
        for (const [chunkKey, chunk] of this.loadedChunks) {
            // Check if chunk is visible
            if (chunk.worldX + this.chunkSize < viewBounds.left || 
                chunk.worldX > viewBounds.right ||
                chunk.worldY + this.chunkSize < viewBounds.top || 
                chunk.worldY > viewBounds.bottom) {
                continue;
            }
            
            const fogData = this.fogOfWar.get(chunkKey);
            if (fogData) {
                this.ctx.drawImage(fogData.canvas, chunk.worldX, chunk.worldY);
            }
        }
        
        this.ctx.restore();
    }
    
    renderMultiplayerUI() {
        // Connection status
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        
        const statusColor = this.isConnected ? '#4caf50' : '#f44336';
        const statusText = this.isConnected ? 'Online' : 'Offline';
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 120, 40);
        
        this.ctx.fillStyle = statusColor;
        this.ctx.font = '14px Space Mono';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`● ${statusText}`, 20, 30);
        
        if (this.worldId) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '10px Space Mono';
            this.ctx.fillText(`World: ${this.worldId}`, 20, 45);
        }
        
        // Player count
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '10px Space Mono';
        this.ctx.fillText(`Players: ${this.otherPlayers.size + 1}`, 20, 60);
        
        this.ctx.restore();
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
    
    updateResourceDisplay() {
        // Calculate production rates per second
        const productionRates = {
            food: 0,
            wood: 0,
            iron: 0,
            gold: 0
        };
        
        // Calculate population growth rate
        let populationRate = 0;
        
        // Calculate total production from all buildings
        this.buildings.forEach(building => {
            if (building.produces) {
                for (const [resource, amount] of Object.entries(building.produces)) {
                    if (productionRates.hasOwnProperty(resource)) {
                        productionRates[resource] += amount / 3; // Per second (buildings produce every 3 seconds)
                    } else if (resource === 'population') {
                        populationRate += amount / 3; // Population growth rate
                    }
                }
            }
        });
        
        // Update display with production rates
        document.getElementById('food').textContent = Math.floor(this.resources.food);
        document.querySelector('#food').nextElementSibling.textContent = `(${productionRates.food > 0 ? '+' : ''}${productionRates.food.toFixed(1)}/ps)`;
        
        document.getElementById('wood').textContent = Math.floor(this.resources.wood);
        document.querySelector('#wood').nextElementSibling.textContent = `(${productionRates.wood > 0 ? '+' : ''}${productionRates.wood.toFixed(1)}/ps)`;
        
        document.getElementById('iron').textContent = Math.floor(this.resources.iron);
        document.querySelector('#iron').nextElementSibling.textContent = `(${productionRates.iron > 0 ? '+' : ''}${productionRates.iron.toFixed(1)}/ps)`;
        
        document.getElementById('gold').textContent = Math.floor(this.resources.gold);
        document.querySelector('#gold').nextElementSibling.textContent = `(${productionRates.gold > 0 ? '+' : ''}${productionRates.gold.toFixed(1)}/ps)`;
        
        // Update population display
        document.getElementById('population').textContent = this.population;
        document.querySelector('#population').nextElementSibling.textContent = `(${populationRate > 0 ? '+' : ''}${populationRate.toFixed(1)}/ps)`;
    }
    
    updatePopulationDisplay() {
        document.getElementById('population').textContent = this.population;
    }
    
    updateStatsDisplay() {
        // Calculate happiness based on buildings
        const temples = this.buildings.filter(b => b.type === 'temple').length;
        const happiness = Math.min(100, 50 + temples * 15);
        
        // Calculate defense
        const blacksmiths = this.buildings.filter(b => b.type === 'blacksmith').length;
        const defense = Math.min(100, blacksmiths * 20);
        
        // Calculate prosperity
        const tradingPosts = this.buildings.filter(b => b.type === 'tradingpost').length;
        const prosperity = Math.min(100, 30 + tradingPosts * 25);
        
        document.getElementById('happinessBar').style.width = `${happiness}%`;
        document.getElementById('defenseBar').style.width = `${defense}%`;
        document.getElementById('prosperityBar').style.width = `${prosperity}%`;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('notifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
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
}

// Start the game when page loads
window.addEventListener('load', () => {
    // Add check for Socket.IO availability
    if (typeof io === 'undefined') {
        console.error('Socket.IO client library not loaded. Please check server connection.');
        return;
    }
    
    const game = new VikingSettlementTycoon();
});