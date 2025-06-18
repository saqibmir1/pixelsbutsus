class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('pixel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');
        
        // Canvas settings
        this.gridSize = 1000; // 1000x1000 grid
        this.pixelSize = 10; // Each pixel is 10x10 pixels on screen at 1x zoom
        this.zoom = 1;
        this.minZoom = 0.5;
        this.maxZoom = 4;
        
        // Pan settings
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.lastPanX = 0;
        this.lastPanY = 0;
        
        // Drawing settings
        this.selectedColor = '#FFFFFF';
        this.isErasing = false;
        this.pixels = new Map(); // Store pixels as "x,y" -> color
        
        // WebSocket
        this.ws = null;
        this.connected = false;
        this.userCount = 0;
        
        // Touch handling
        this.touches = [];
        this.lastTouchDistance = 0;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadPixels();
        
        // Center the canvas initially
        this.centerCanvas();
        this.render();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.centerCanvas();
        this.render();
    }
    
    centerCanvas() {
        // Center the canvas on the grid initially
        const canvasCenter = this.gridSize * this.pixelSize * this.zoom / 2;
        this.offsetX = this.canvas.width / 2 - canvasCenter;
        this.offsetY = this.canvas.height / 2 - canvasCenter;
    }
    
    setupEventListeners() {
        // Color palette
        document.querySelectorAll('.color').forEach(colorEl => {
            colorEl.addEventListener('click', (e) => {
                document.querySelector('.color.selected')?.classList.remove('selected');
                e.target.classList.add('selected');
                this.selectedColor = e.target.dataset.color;
                this.isErasing = false;
                document.getElementById('eraser-btn').classList.remove('active');
                document.getElementById('selected-color').style.backgroundColor = this.selectedColor;
            });
        });
        
        // Eraser tool
        document.getElementById('eraser-btn').addEventListener('click', () => {
            this.isErasing = !this.isErasing;
            document.getElementById('eraser-btn').classList.toggle('active', this.isErasing);
            if (this.isErasing) {
                document.querySelector('.color.selected')?.classList.remove('selected');
                document.getElementById('selected-color').style.backgroundColor = 'transparent';
            }
        });
        
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Prevent scrolling on mobile
        this.canvas.addEventListener('touchstart', (e) => e.preventDefault());
        this.canvas.addEventListener('touchmove', (e) => e.preventDefault());
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.connected = true;
            this.updateConnectionStatus();
        };
        
        this.ws.onclose = () => {
            this.connected = false;
            this.updateConnectionStatus();
            // Reconnect after 3 seconds
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.connected = false;
            this.updateConnectionStatus();
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
    }
    
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'pixel_update':
                this.updatePixel(data.x, data.y, data.color);
                break;
            case 'pixel_delete':
                this.deletePixel(data.x, data.y);
                break;
            case 'user_count':
                this.userCount = data.count;
                document.getElementById('users-count').textContent = `Users: ${this.userCount}`;
                break;
        }
    }
    
    updateConnectionStatus() {
        let statusEl = document.querySelector('.connection-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'connection-status';
            document.body.appendChild(statusEl);
        }
        
        if (this.connected) {
            statusEl.className = 'connection-status connected';
            statusEl.textContent = '● Connected';
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.textContent = '● Disconnected';
        }
    }
    
    async loadPixels() {
        try {
            const response = await fetch('/api/pixels');
            const pixels = await response.json();
            
            this.pixels.clear();
            pixels.forEach(pixel => {
                this.pixels.set(`${pixel.x},${pixel.y}`, pixel.color);
            });
            
            this.render();
        } catch (error) {
            console.error('Failed to load pixels:', error);
        }
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (e.button === 0) { // Left click
            const gridPos = this.screenToGrid(x, y);
            if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                this.placePixel(gridPos.x, gridPos.y);
            }
        } else if (e.button === 2) { // Right click - start panning
            this.startPan(x, y);
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update coordinates display
        const gridPos = this.screenToGrid(x, y);
        document.getElementById('coordinates').textContent = `X: ${gridPos.x}, Y: ${gridPos.y}`;
        
        if (this.isPanning) {
            this.updatePan(x, y);
        }
    }
    
    handleMouseUp(e) {
        if (e.button === 2) { // Right click
            this.endPan();
        }
    }
    
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAt(mouseX, mouseY, delta);
    }
    
    handleTouchStart(e) {
        this.touches = Array.from(e.touches);
        
        if (this.touches.length === 1) {
            const touch = this.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            const gridPos = this.screenToGrid(x, y);
            if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                this.placePixel(gridPos.x, gridPos.y);
            }
        } else if (this.touches.length === 2) {
            this.lastTouchDistance = this.getTouchDistance();
        }
    }
    
    handleTouchMove(e) {
        this.touches = Array.from(e.touches);
        
        if (this.touches.length === 2) {
            const currentDistance = this.getTouchDistance();
            const scale = currentDistance / this.lastTouchDistance;
            
            const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
            const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
            const rect = this.canvas.getBoundingClientRect();
            
            this.zoomAt(centerX - rect.left, centerY - rect.top, scale);
            this.lastTouchDistance = currentDistance;
        }
    }
    
    handleTouchEnd(e) {
        this.touches = Array.from(e.touches);
        if (this.touches.length < 2) {
            this.lastTouchDistance = 0;
        }
    }
    
    getTouchDistance() {
        if (this.touches.length < 2) return 0;
        const dx = this.touches[0].clientX - this.touches[1].clientX;
        const dy = this.touches[0].clientY - this.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    startPan(x, y) {
        this.isPanning = true;
        this.lastPanX = x;
        this.lastPanY = y;
        this.container.classList.add('panning');
    }
    
    updatePan(x, y) {
        if (!this.isPanning) return;
        
        const dx = x - this.lastPanX;
        const dy = y - this.lastPanY;
        
        this.offsetX += dx;
        this.offsetY += dy;
        
        this.lastPanX = x;
        this.lastPanY = y;
        
        this.render();
    }
    
    endPan() {
        this.isPanning = false;
        this.container.classList.remove('panning');
    }
    
    zoomAt(x, y, scale) {
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * scale));
        
        if (newZoom !== this.zoom) {
            const zoomRatio = newZoom / this.zoom;
            
            this.offsetX = x - (x - this.offsetX) * zoomRatio;
            this.offsetY = y - (y - this.offsetY) * zoomRatio;
            
            this.zoom = newZoom;
            
            document.getElementById('zoom-level').textContent = `Zoom: ${this.zoom.toFixed(1)}x`;
            this.render();
        }
    }
    
    screenToGrid(screenX, screenY) {
        const worldX = (screenX - this.offsetX) / this.zoom;
        const worldY = (screenY - this.offsetY) / this.zoom;
        
        return {
            x: Math.floor(worldX / this.pixelSize),
            y: Math.floor(worldY / this.pixelSize)
        };
    }
    
    gridToScreen(gridX, gridY) {
        return {
            x: (gridX * this.pixelSize) * this.zoom + this.offsetX,
            y: (gridY * this.pixelSize) * this.zoom + this.offsetY
        };
    }
    
    isValidGridPosition(x, y) {
        return x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize;
    }
    
    async placePixel(x, y) {
        try {
            if (this.isErasing) {
                await this.deletePixelFromServer(x, y);
            } else {
                await this.sendPixelToServer(x, y, this.selectedColor);
            }
        } catch (error) {
            console.error('Failed to place pixel:', error);
        }
    }
    
    async sendPixelToServer(x, y, color) {
        const response = await fetch('/api/pixel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ x, y, color })
        });
        
        if (!response.ok) {
            throw new Error('Failed to place pixel');
        }
    }
    
    async deletePixelFromServer(x, y) {
        const response = await fetch('/api/pixel', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ x, y })
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete pixel');
        }
    }
    
    updatePixel(x, y, color) {
        this.pixels.set(`${x},${y}`, color);
        this.renderPixel(x, y, color);
    }
    
    deletePixel(x, y) {
        this.pixels.delete(`${x},${y}`);
        this.clearPixel(x, y);
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid background
        this.drawGrid();
        
        // Draw all pixels
        this.pixels.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            this.renderPixel(x, y, color);
        });
    }
    
    drawGrid() {
        const scaledPixelSize = this.pixelSize * this.zoom;
        
        if (scaledPixelSize < 2) return; // Don't draw grid if too small
        
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        
        const startX = Math.floor((-this.offsetX) / scaledPixelSize) * scaledPixelSize + this.offsetX;
        const startY = Math.floor((-this.offsetY) / scaledPixelSize) * scaledPixelSize + this.offsetY;
        
        this.ctx.beginPath();
        
        // Vertical lines
        for (let x = startX; x < this.canvas.width; x += scaledPixelSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        
        // Horizontal lines
        for (let y = startY; y < this.canvas.height; y += scaledPixelSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        
        this.ctx.stroke();
    }
    
    renderPixel(gridX, gridY, color) {
        const screenPos = this.gridToScreen(gridX, gridY);
        const size = this.pixelSize * this.zoom;
        
        this.ctx.fillStyle = color;
        this.ctx.fillRect(screenPos.x, screenPos.y, size, size);
    }
    
    clearPixel(gridX, gridY) {
        const screenPos = this.gridToScreen(gridX, gridY);
        const size = this.pixelSize * this.zoom;
        
        this.ctx.clearRect(screenPos.x, screenPos.y, size, size);
        
        // Redraw grid lines in this area
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenPos.x, screenPos.y, size, size);
    }
}

// Initialize the canvas when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PixelCanvas();
});