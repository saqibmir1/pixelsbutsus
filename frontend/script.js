class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('pixel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');

        // Canvas settings
        this.gridSize = 3000;
        this.pixelSize = 1;
        this.zoom = 0.3;
        this.minZoom = 0.1;
        this.maxZoom = 40;

        // Pan settings
        this.viewportX = 0;
        this.viewportY = 0;
        this.isPanning = false;
        this.lastPanX = 0;
        this.lastPanY = 0;

        // Drawing settings
        this.selectedColor = '#000000';
        this.isErasing = false;
        this.pixels = new Map();
        this.pixelMetadata = new Map();

        // WebSocket
        this.ws = null;
        this.connected = false;
        this.userCount = 0;

        // Touch handling
        this.touches = [];
        this.lastTouchDistance = 0;
        this.touchStartTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchMoved = false;

        // Pixel info hover
        this.pixelInfoTimeout = null

        // user name
        this.userName = localStorage.getItem('pixelUserName') || '';
        if (!this.userName) {
            this.initNameModal();
        }

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadPixels();
        this.centerCanvas();
    }

    initNameModal() {
        const modal = document.getElementById('name-modal');
        const input = document.getElementById('username-input');
        const submitBtn = document.getElementById('submit-name');

        modal.style.display = 'block';
        input.focus();

        const handleSubmit = () => {
            const name = input.value.trim();
            if (name) {
                this.userName = name;
                localStorage.setItem('pixelUserName', name);
                modal.style.display = 'none';

                // Remove event listeners after submission
                submitBtn.removeEventListener('click', handleSubmit);
                input.removeEventListener('keypress', handleKeyPress);
            } else {
                alert('Please enter a valid name');
                input.focus();
            }
        };

        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        };

        submitBtn.addEventListener('click', handleSubmit);
        input.addEventListener('keypress', handleKeyPress);
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    centerCanvas() {
        this.viewportX = 0;
        this.viewportY = 0;
        this.render();
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
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
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
                this.updatePixel(data.x, data.y, data.color, {
                    color: data.color,
                    insertedBy: data.insertedBy,
                    updatedAt: data.updatedAt
                });
                break;
            case 'pixel_delete':
                this.deletePixel(data.x, data.y);
                break;
            case 'user_count':
                this.userCount = data.count;
                // Update to match new HTML structure
                const usersCountEl = document.getElementById('users-count');
                if (usersCountEl) {
                    usersCountEl.textContent = `${data.count} online`;
                }
                break;
        }
    }

    updateConnectionStatus() {
        const statusEl = document.querySelector('.status-indicator');
        const connectionText = document.querySelector('.connection-status span');

        if (!statusEl || !connectionText) return;

        if (this.connected) {
            statusEl.className = 'status-indicator connected';
            connectionText.textContent = `${this.userCount} online`;
        } else {
            statusEl.className = 'status-indicator disconnected';
            connectionText.textContent = 'offline';
        }
    }

    async loadPixels() {
        try {
            const response = await fetch('/api/pixels-with-metadata');
            const pixels = await response.json();

            this.pixels.clear();
            this.pixelMetadata.clear();

            pixels.forEach(pixel => {
                this.pixels.set(`${pixel.x},${pixel.y}`, pixel.color);
                this.pixelMetadata.set(`${pixel.x},${pixel.y}`, {
                    color: pixel.color,
                    insertedBy: pixel.insertedBy,
                    updatedAt: pixel.updatedAt
                });
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

        if (e.button === 0) {
            const gridPos = this.screenToGrid(x, y);
            if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                this.placePixel(gridPos.x, gridPos.y);
            }
        } else if (e.button === 2) {
            this.startPan(x, y);
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridPos = this.screenToGrid(x, y);
        document.getElementById('coordinates').textContent = `X: ${gridPos.x}, Y: ${gridPos.y}`;

        // Update pixel info position
        this.updatePixelInfoPosition(e.clientX, e.clientY);

        // Only show info if this pixel exists in our metadata
        if (this.pixelMetadata.has(`${gridPos.x},${gridPos.y}`)) {
            this.showPixelInfo(gridPos.x, gridPos.y);
        } else {
            this.hidePixelInfo();
        }

        if (this.isPanning) {
            this.updatePan(x, y);
        }
    }

    handleMouseUp(e) {
        if (e.button === 2) {
            this.endPan();
        }
    }

    handleMouseLeave() {
        this.hidePixelInfo();
        if (this.isPanning) {
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
        e.preventDefault();
        this.touches = Array.from(e.touches);

        if (this.touches.length === 1) {
            const touch = this.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            this.touchStartTime = Date.now();
            this.touchStartX = x;
            this.touchStartY = y;
            this.touchMoved = false;

        } else if (this.touches.length === 2) {
            this.lastTouchDistance = this.getTouchDistance();
            this.touchStartTime = null;
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);

        if (this.touches.length === 1) {
            const touch = this.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            const moveDistance = Math.sqrt(
                Math.pow(x - this.touchStartX, 2) +
                Math.pow(y - this.touchStartY, 2)
            );

            if (moveDistance > 10) {
                this.touchMoved = true;

                if (!this.isPanning) {
                    this.startPan(this.touchStartX, this.touchStartY);
                }

                this.updatePan(x, y);
            }

        } else if (this.touches.length === 2) {
            const currentDistance = this.getTouchDistance();
            if (this.lastTouchDistance > 0) {
                const scale = currentDistance / this.lastTouchDistance;

                const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
                const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
                const rect = this.canvas.getBoundingClientRect();

                this.zoomAt(centerX - rect.left, centerY - rect.top, scale);
            }
            this.lastTouchDistance = currentDistance;
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);

        if (this.touches.length === 0) {
            if (this.isPanning) {
                this.endPan();
            } else if (!this.touchMoved && this.touchStartTime) {
                const timeDiff = Date.now() - this.touchStartTime;
                if (timeDiff < 300) {
                    const gridPos = this.screenToGrid(this.touchStartX, this.touchStartY);
                    if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                        this.placePixel(gridPos.x, gridPos.y);
                    }
                }
            }

            this.touchStartTime = null;
            this.touchMoved = false;
            this.lastTouchDistance = 0;

        } else if (this.touches.length < 2) {
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

        this.viewportX += dx;
        this.viewportY += dy;

        this.clampOffsets();

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
            const gridPos = this.screenToGrid(x, y);
            this.zoom = newZoom;
            const newScreenPos = this.gridToScreen(gridPos.x, gridPos.y);

            this.viewportX += (x - newScreenPos.x);
            this.viewportY += (y - newScreenPos.y);

            this.clampOffsets();

            document.getElementById('zoom-level').textContent = `Zoom: ${this.zoom.toFixed(1)}x`;
            this.render();
        }
    }

    screenToGrid(screenX, screenY) {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        const worldX = (screenX - centerX - this.viewportX) / this.zoom;
        const worldY = (screenY - centerY - this.viewportY) / this.zoom;

        return {
            x: Math.floor(worldX / this.pixelSize),
            y: Math.floor(worldY / this.pixelSize)
        };
    }

    gridToScreen(gridX, gridY) {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        return {
            x: centerX + (gridX * this.pixelSize) * this.zoom + this.viewportX,
            y: centerY + (gridY * this.pixelSize) * this.zoom + this.viewportY
        };
    }

    clampOffsets() {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;

        const maxViewportX = canvasWidth / 2;
        const maxViewportY = canvasHeight / 2;

        this.viewportX = Math.max(-maxViewportX, Math.min(maxViewportX, this.viewportX));
        this.viewportY = Math.max(-maxViewportY, Math.min(maxViewportY, this.viewportY));
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
            body: JSON.stringify({
                x,
                y,
                color,
                insertedBy: this.userName
            })
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

    updatePixel(x, y, color, metadata = null) {
        this.pixels.set(`${x},${y}`, color);

        if (metadata) {
            this.pixelMetadata.set(`${x},${y}`, metadata);
        } else if (this.pixelMetadata.has(`${x},${y}`)) {
            const existing = this.pixelMetadata.get(`${x},${y}`);
            existing.color = color;
            this.pixelMetadata.set(`${x},${y}`, existing);
        }

        this.renderPixel(x, y, color);
    }

    deletePixel(x, y) {
        this.pixels.delete(`${x},${y}`);
        this.pixelMetadata.delete(`${x},${y}`);
        this.clearPixel(x, y);
    }

    showPixelInfo(x, y) {
        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        const pixelKey = `${x},${y}`;

        if (this.pixelMetadata.has(pixelKey)) {
            this.pixelInfoTimeout = setTimeout(() => {
                const data = this.pixelMetadata.get(pixelKey);
                const pixelInfo = document.getElementById('pixel-info');

                pixelInfo.innerHTML = `
                    <div><strong>Position:</strong> ${x}, ${y}</div>
                    <div><strong>Color:</strong> <span style="color:${data.color}">${data.color}</span></div>
                    <div><strong>Placed by:</strong> ${data.insertedBy || 'Anonymous'}</div>
                    <div><strong>Last updated:</strong> ${new Date(data.updatedAt).toLocaleString()}</div>
                `;
                pixelInfo.style.display = 'block';
            }, 1000);
        }
    }

    hidePixelInfo() {
        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        const pixelInfo = document.getElementById('pixel-info');
        pixelInfo.style.display = 'none';
    }

    updatePixelInfoPosition(x, y) {
        const pixelInfo = document.getElementById('pixel-info');
        pixelInfo.style.left = `${x + 10}px`;
        pixelInfo.style.top = `${y + 10}px`;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();

        this.pixels.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            this.renderPixel(x, y, color);
        });
    }

    drawGrid() {
        const scaledPixelSize = this.pixelSize * this.zoom;

        if (scaledPixelSize < 2) return;

        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;

        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        const startX = Math.floor((centerX + this.viewportX - this.offsetX) / scaledPixelSize) * scaledPixelSize + this.offsetX;
        const startY = Math.floor((centerY + this.viewportY - this.offsetY) / scaledPixelSize) * scaledPixelSize + this.offsetY;

        this.ctx.beginPath();

        for (let x = startX; x < this.canvas.width; x += scaledPixelSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }

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
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(screenPos.x, screenPos.y, size, size);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PixelCanvas();
});