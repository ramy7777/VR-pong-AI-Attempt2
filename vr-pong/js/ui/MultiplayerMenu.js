import * as THREE from 'three';

export class MultiplayerMenu {
    constructor(scene) {
        this.scene = scene;
        this.menuGroup = new THREE.Group();
        this.buttons = {
            singleplayer: null,
            host: null,
            join: null,
            back: null
        };
        this.isVisible = false;
        this.callbacks = {
            onSingleplayer: null,
            onHost: null,
            onJoin: null,
            onBack: null
        };
        
        // Track currently hovered button
        this.currentHoveredButton = null;
        
        // Animation properties
        this.animationDuration = 400; // ms
        this.animationStartTime = 0;
        this.isAnimating = false;
        this.animationDirection = 'in'; // 'in' or 'out'
        
        // Preload Orbitron font to use in canvas
        this.fontLoaded = false;
        this.preloadOrbitronFont();
        
        // Add debounce mechanism to prevent multiple activations
        this.lastButtonPressTime = 0;
        this.buttonCooldown = 800; // Increased from 500ms to 800ms to prevent accidental double clicks
        
        // Add a buffer time when menu first appears to prevent accidental button presses
        this.showTime = 0;
        this.showDelay = 1000; // 1 second delay after showing before accepting input
        
        // Enhanced button properties with modern color scheme
        this.buttonColors = {
            singleplayer: {
                base: 0x4CAF50, // Green
                hover: 0x66BB6A,
                click: 0x388E3C
            },
            host: {
                base: 0x2196F3, // Blue
                hover: 0x42A5F5,
                click: 0x1976D2
            },
            join: {
                base: 0xFFA000, // Amber
                hover: 0xFFB300,
                click: 0xFF8F00
            },
            back: {
                base: 0xE53935, // Red
                hover: 0xEF5350,
                click: 0xC62828
            }
        };
        
        this.buttonMaterialParams = {
            metalness: 0.5,
            roughness: 0.3
        };
        
        this.createMenu();
        
        // Set initial animation values
        this.menuGroup.scale.set(0.01, 0.01, 0.01);
        this.menuGroup.userData.originalPosition = this.menuGroup.position.clone();
        this.menuGroup.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.menuGroup.userData.originalOpacity = 1;
        
        // Set up animation update BEFORE calling hide
        this.setupAnimation();
        
        // Initially hidden - AFTER animation setup
        this.menuGroup.visible = false;
        this.isVisible = false;
    }
    
    // Preload Orbitron font for canvas text
    preloadOrbitronFont() {
        // Create a font face observer for Orbitron
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        
        // Create a test element to force font loading
        const testElement = document.createElement('div');
        testElement.style.fontFamily = 'Orbitron, Arial, sans-serif';
        testElement.style.position = 'absolute';
        testElement.style.visibility = 'hidden';
        testElement.textContent = 'Font Preload';
        document.body.appendChild(testElement);
        
        // Set a timeout to ensure font is loaded
        setTimeout(() => {
            this.fontLoaded = true;
            document.body.removeChild(testElement);
            
            // Update text if necessary
            this.updateButtonText();
        }, 500);
    }
    
    // Add method to update button text
    updateButtonText() {
        // Only update if font is loaded and buttons exist
        if (!this.fontLoaded || !this.buttons.singleplayer) return;
        
        console.log('MultiplayerMenu: Updating button text');
        
        // Get texts for each button
        this.updateButtonTextCanvas(this.buttons.singleplayer, 'SINGLE PLAYER');
        this.updateButtonTextCanvas(this.buttons.host, 'HOST GAME');
        this.updateButtonTextCanvas(this.buttons.join, 'QUICK JOIN');
        this.updateButtonTextCanvas(this.buttons.back, 'BACK');
    }
    
    // Force recreate all button text canvases - useful when text disappears
    forceTextUpdate() {
        if (!this.fontLoaded || !this.buttons.singleplayer) return;
        
        console.log('MultiplayerMenu: Force recreating all button text canvases');
        
        // Completely recreate text canvases for all buttons
        this.recreateButtonTextCanvas(this.buttons.singleplayer, 'SINGLE PLAYER');
        this.recreateButtonTextCanvas(this.buttons.host, 'HOST GAME');
        this.recreateButtonTextCanvas(this.buttons.join, 'QUICK JOIN');
        this.recreateButtonTextCanvas(this.buttons.back, 'BACK');
        
        // Schedule multiple updates to ensure text appears
        this.scheduleTextRefreshes();
    }
    
    // New method to schedule multiple text updates
    scheduleTextRefreshes() {
        // Schedule multiple text updates to ensure visibility
        // Some 3D engines/browsers may need multiple refreshes to properly show canvas textures
        const refreshTimes = [100, 300, 600, 1000, 1500, 2000]; // Add longer refresh times for safety
        
        refreshTimes.forEach(delay => {
            setTimeout(() => {
                if (this.isVisible) {
                    console.log(`MultiplayerMenu: Scheduled text refresh after ${delay}ms`);
                    this.recreateButtonTextCanvas(this.buttons.singleplayer, 'SINGLE PLAYER');
                    this.recreateButtonTextCanvas(this.buttons.host, 'HOST GAME');
                    this.recreateButtonTextCanvas(this.buttons.join, 'QUICK JOIN');
                    this.recreateButtonTextCanvas(this.buttons.back, 'BACK');
                }
            }, delay);
        });
        
        // Extra safety check - verify all button text is visible when animation completes
        setTimeout(() => {
            if (this.isVisible) {
                console.log("MultiplayerMenu: Final safety text refresh to ensure visibility");
                this.recreateButtonTextCanvas(this.buttons.singleplayer, 'SINGLE PLAYER');
                this.recreateButtonTextCanvas(this.buttons.host, 'HOST GAME');
                this.recreateButtonTextCanvas(this.buttons.join, 'QUICK JOIN');
                this.recreateButtonTextCanvas(this.buttons.back, 'BACK');
            }
        }, this.animationDuration + 100); // Slightly after animation should complete
    }
    
    // Method to completely recreate a button's text canvas
    recreateButtonTextCanvas(buttonGroup, text) {
        // Find the text mesh
        const textMesh = buttonGroup.children.find(child => child instanceof THREE.Mesh && 
                                                child.material && 
                                                (child.material.map instanceof THREE.CanvasTexture || child.name === 'textMesh'));
        
        if (!textMesh) return;
        
        // Remove the existing material and texture to prevent memory leaks
        if (textMesh.material) {
            if (textMesh.material.map) {
                textMesh.material.map.dispose();
            }
            textMesh.material.dispose();
        }
        
        // Create a new canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add subtle gradient to text
        const textGradient = context.createLinearGradient(0, 0, 0, canvas.height);
        textGradient.addColorStop(0, '#ffffff');
        textGradient.addColorStop(1, '#f0f0f0');
        
        context.fillStyle = textGradient;
        
        // Adjust font size based on text length
        let fontSize = 32;
        if (text.length > 10) {
            fontSize = 28;
        }
        if (text.length > 12) {
            fontSize = 24;
        }
        
        context.font = `bold ${fontSize}px Orbitron, Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Add shadow to text
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
        
        // Draw the text
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Add subtle glow
        context.globalCompositeOperation = 'lighter';
        context.shadowColor = 'rgba(255, 255, 255, 0.5)';
        context.shadowBlur = 3;
        context.fillStyle = 'rgba(255, 255, 255, 0.2)';
        
        // Redraw with glow
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        context.globalCompositeOperation = 'source-over';
        
        // Create a new texture and material
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true
        });
        
        // Assign the new material to the text mesh
        textMesh.material = material;
        textMesh.name = 'textMesh'; // Mark as text mesh for future identification
    }
    
    // Method to update button text canvas
    updateButtonTextCanvas(buttonGroup, text) {
        // Get the text mesh from the button group
        const textMesh = buttonGroup.children.find(child => child instanceof THREE.Mesh && 
                                                child.material && 
                                                (child.material.map instanceof THREE.CanvasTexture || child.name === 'textMesh'));
        
        if (!textMesh) return;
        
        // Check if the texture exists, if not, recreate it completely
        if (!textMesh.material || !textMesh.material.map) {
            this.recreateButtonTextCanvas(buttonGroup, text);
            return;
        }
        
        // Create canvas for button text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add subtle gradient to text
        const textGradient = context.createLinearGradient(0, 0, 0, canvas.height);
        textGradient.addColorStop(0, '#ffffff');
        textGradient.addColorStop(1, '#f0f0f0');
        
        context.fillStyle = textGradient;
        
        // Adjust font size based on text length
        let fontSize = 32;
        if (text.length > 10) {
            fontSize = 28;
        }
        if (text.length > 12) {
            fontSize = 24;
        }
        
        context.font = `bold ${fontSize}px Orbitron, Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Add shadow to text
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
        
        // Draw the text
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Add subtle glow
        context.globalCompositeOperation = 'lighter';
        context.shadowColor = 'rgba(255, 255, 255, 0.5)';
        context.shadowBlur = 3;
        context.fillStyle = 'rgba(255, 255, 255, 0.2)';
        
        // Redraw with glow
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        context.globalCompositeOperation = 'source-over';
        
        // Update the texture
        if (textMesh.material.map) {
            textMesh.material.map.image = canvas;
            textMesh.material.map.needsUpdate = true;
        }
    }
    
    createMenu() {
        // Create background panel with gradient effect
        const panelGeometry = new THREE.BoxGeometry(1.2, 1.0, 0.02);
        
        // Create a gradient texture for the panel
        const panelCanvas = document.createElement('canvas');
        const panelContext = panelCanvas.getContext('2d');
        panelCanvas.width = 512;
        panelCanvas.height = 512;
        
        const gradient = panelContext.createLinearGradient(0, 0, 0, panelCanvas.height);
        gradient.addColorStop(0, '#1a237e'); // Dark blue at top
        gradient.addColorStop(1, '#0d47a1'); // Slightly lighter blue at bottom
        
        panelContext.fillStyle = gradient;
        panelContext.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
        
        // Add a subtle pattern overlay
        panelContext.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * panelCanvas.width;
            const y = Math.random() * panelCanvas.height;
            const size = Math.random() * 3 + 1;
            panelContext.fillRect(x, y, size, size);
        }
        
        // Add a light vignette effect
        const centerX = panelCanvas.width / 2;
        const centerY = panelCanvas.height / 2;
        const radius = Math.max(centerX, centerY);
        const gradient2 = panelContext.createRadialGradient(
            centerX, centerY, radius * 0.5,
            centerX, centerY, radius * 1.5
        );
        gradient2.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient2.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        panelContext.fillStyle = gradient2;
        panelContext.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
        
        const panelTexture = new THREE.CanvasTexture(panelCanvas);
        const panelMaterial = new THREE.MeshStandardMaterial({
            map: panelTexture,
            metalness: 0.2,
            roughness: 0.8,
            transparent: true,
            opacity: 0.9
        });
        
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        
        // Add a subtle glow to the panel edges
        const glowGeometry = new THREE.BoxGeometry(1.24, 1.04, 0.01);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4d69ff,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        panel.add(glowMesh);
        
        this.menuGroup.add(panel);
        
        // Create more visually appealing title
        const titleCanvas = document.createElement('canvas');
        const titleContext = titleCanvas.getContext('2d');
        titleCanvas.width = 512;
        titleCanvas.height = 128;
        
        // Fill with gradient
        const titleGradient = titleContext.createLinearGradient(0, 0, 0, titleCanvas.height);
        titleGradient.addColorStop(0, '#ffffff');
        titleGradient.addColorStop(1, '#b3e5fc');
        
        titleContext.fillStyle = titleGradient;
        titleContext.font = 'bold 64px Orbitron, Arial, sans-serif';
        titleContext.textAlign = 'center';
        titleContext.textBaseline = 'middle';
        
        // Add shadow to text
        titleContext.shadowColor = 'rgba(0, 0, 0, 0.5)';
        titleContext.shadowBlur = 8;
        titleContext.shadowOffsetX = 2;
        titleContext.shadowOffsetY = 2;
        
        titleContext.fillText('GAME MODE', titleCanvas.width / 2, titleCanvas.height / 2);
        
        // Add subtle underline
        titleContext.shadowBlur = 0;
        titleContext.shadowOffsetX = 0;
        titleContext.shadowOffsetY = 0;
        titleContext.strokeStyle = '#ffffff';
        titleContext.lineWidth = 2;
        titleContext.beginPath();
        titleContext.moveTo(128, 90);
        titleContext.lineTo(384, 90);
        titleContext.stroke();
        
        // Add glow effect
        titleContext.globalCompositeOperation = 'lighter';
        titleContext.shadowColor = '#4d69ff';
        titleContext.shadowBlur = 15;
        titleContext.fillStyle = 'rgba(77, 105, 255, 0.3)';
        titleContext.fillText('GAME MODE', titleCanvas.width / 2, titleCanvas.height / 2);
        titleContext.globalCompositeOperation = 'source-over';
        
        const titleTexture = new THREE.CanvasTexture(titleCanvas);
        const titleMaterial = new THREE.MeshBasicMaterial({
            map: titleTexture,
            transparent: true
        });
        
        const titleGeometry = new THREE.PlaneGeometry(0.8, 0.2);
        const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
        titleMesh.position.set(0, 0.35, 0.02);
        this.menuGroup.add(titleMesh);
        
        // Create modernized buttons
        this.buttons.singleplayer = this.createButton('SINGLE PLAYER', 0, 0.15, 0.02, 'singleplayer');
        this.menuGroup.add(this.buttons.singleplayer);
        
        this.buttons.host = this.createButton('HOST GAME', 0, -0.05, 0.02, 'host');
        this.menuGroup.add(this.buttons.host);
        
        this.buttons.join = this.createButton('QUICK JOIN', 0, -0.25, 0.02, 'join');
        this.menuGroup.add(this.buttons.join);
        
        this.buttons.back = this.createButton('BACK', 0, -0.45, 0.02, 'back');
        this.menuGroup.add(this.buttons.back);
        
        // Position the menu in front of the player
        this.menuGroup.position.set(0, 1.6, -1.0);
        this.scene.add(this.menuGroup);
    }
    
    createButton(text, x, y, z, buttonType) {
        const group = new THREE.Group();
        
        // Create rounded button geometry - increase width for longer text
        const buttonWidth = text.length > 10 ? 0.7 : 0.6;
        const buttonGeometry = new THREE.BoxGeometry(buttonWidth, 0.15, 0.04);
        buttonGeometry.userData = { originalGeometry: buttonGeometry.clone() };
        
        // Get color from the button type
        const buttonColor = this.buttonColors[buttonType];
        
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: buttonColor.base,
            emissive: buttonColor.base,
            emissiveIntensity: 0.2,
            metalness: this.buttonMaterialParams.metalness,
            roughness: this.buttonMaterialParams.roughness
        });
        
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
        
        // Add subtle bevel to buttons - adjust bevel width to match button width
        const edgeGeometry = new THREE.BoxGeometry(buttonWidth + 0.02, 0.17, 0.03);
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.7,
            roughness: 0.2,
            transparent: true,
            opacity: 0.1
        });
        const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edgeMesh.position.z = -0.005;
        buttonMesh.add(edgeMesh);
        
        group.add(buttonMesh);
        
        // Create improved text with shadow
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add subtle gradient to text
        const textGradient = context.createLinearGradient(0, 0, 0, canvas.height);
        textGradient.addColorStop(0, '#ffffff');
        textGradient.addColorStop(1, '#f0f0f0');
        
        context.fillStyle = textGradient;
        
        // Adjust font size based on text length
        let fontSize = 32;
        if (text.length > 10) {
            fontSize = 28;
        }
        if (text.length > 12) {
            fontSize = 24;
        }
        
        context.font = `bold ${fontSize}px Orbitron, Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Add shadow to text
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
        
        // Add letter spacing effect with dynamic adjustment
        const letters = text.split('');
        // Reduce letter spacing for longer text
        const letterSpacing = text.length > 10 ? 1 : 2;
        const totalTextWidth = letters.reduce((width, letter) => width + context.measureText(letter).width + letterSpacing, 0) - letterSpacing;
        
        // If text is still too wide, just render it without spacing
        if (totalTextWidth > canvas.width * 0.9) {
            // Standard text rendering without letter spacing
            context.fillText(text, canvas.width / 2, canvas.height / 2);
        } else {
            // Apply letter spacing
            let currentX = (canvas.width - totalTextWidth) / 2;
            letters.forEach(letter => {
                context.fillText(letter, currentX + context.measureText(letter).width / 2, canvas.height / 2);
                currentX += context.measureText(letter).width + letterSpacing;
            });
            
            // Add subtle glow
            context.globalCompositeOperation = 'lighter';
            context.shadowColor = 'rgba(255, 255, 255, 0.5)';
            context.shadowBlur = 3;
            context.fillStyle = 'rgba(255, 255, 255, 0.2)';
            
            currentX = (canvas.width - totalTextWidth) / 2;
            letters.forEach(letter => {
                context.fillText(letter, currentX + context.measureText(letter).width / 2, canvas.height / 2);
                currentX += context.measureText(letter).width + letterSpacing;
            });
            context.globalCompositeOperation = 'source-over';
        }
        
        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        // Adjust text plane size to match button width
        const textWidth = text.length > 10 ? 0.65 : 0.55;
        const textGeometry = new THREE.PlaneGeometry(textWidth, 0.1);
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.021;
        group.add(textMesh);
        
        // Set position
        group.position.set(x, y, z);
        
        // Add user data for interaction
        buttonMesh.userData = {
            isButton: true,
            buttonType: buttonType,
            originalColor: buttonColor.base,
            hoverColor: buttonColor.hover,
            clickColor: buttonColor.click,
            isHighlighted: false
        };
        
        return group;
    }
    
    checkIntersection(controller) {
        if (!this.isVisible) return null;
        
        // Skip intersection checks if we're still in the initial delay period
        const now = Date.now();
        if (now - this.showTime < this.showDelay) {
            // Still in delay period, don't process interactions yet
            return null;
        }
        
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        
        // Check intersection with each button
        for (const [key, button] of Object.entries(this.buttons)) {
            const buttonMesh = button.children[0];
            const intersects = raycaster.intersectObject(buttonMesh);
            
            if (intersects.length > 0) {
                return {
                    button: key,
                    mesh: buttonMesh
                };
            }
        }
        
        return null;
    }
    
    highlightButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        // Skip if button is already highlighted
        if (this.currentHoveredButton === buttonKey) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissiveIntensity = 0.5;
        
        // Apply enhanced hover effect with smoother animation
        this.buttons[buttonKey].scale.set(1.1, 1.1, 1.1);
        
        // Add a subtle glow effect
        const edgeMesh = buttonMesh.children[0];
        if (edgeMesh) {
            edgeMesh.material.opacity = 0.3;
        }
        
        buttonMesh.userData.isHighlighted = true;
        this.currentHoveredButton = buttonKey;
    }
    
    unhighlightButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        // Skip if button is not the currently highlighted one
        if (this.currentHoveredButton !== buttonKey) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissiveIntensity = 0.2;
        
        // Reset scale
        this.buttons[buttonKey].scale.set(1.0, 1.0, 1.0);
        
        // Reset glow
        const edgeMesh = buttonMesh.children[0];
        if (edgeMesh) {
            edgeMesh.material.opacity = 0.1;
        }
        
        buttonMesh.userData.isHighlighted = false;
        this.currentHoveredButton = null;
    }
    
    pressButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        // Implement debounce to prevent rapid repeated button presses
        const now = Date.now();
        
        // Skip button press if we're still in the initial delay period
        if (now - this.showTime < this.showDelay) {
            console.log(`MultiplayerMenu: Button ${buttonKey} press ignored (still in show delay): ${now - this.showTime}ms since menu shown. Menu shown at: ${this.showTime}, Current time: ${now}, Delay period: ${this.showDelay}ms`);
            return;
        }
        
        if (now - this.lastButtonPressTime < this.buttonCooldown) {
            console.log(`MultiplayerMenu: Button ${buttonKey} press ignored (cooldown active): ${now - this.lastButtonPressTime}ms since last press. Last press: ${this.lastButtonPressTime}, Current time: ${now}, Cooldown: ${this.buttonCooldown}ms`);
            return;
        }
        console.log(`MultiplayerMenu: Button ${buttonKey} pressed successfully at ${now}`);
        this.lastButtonPressTime = now;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.clickColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.clickColor);
        buttonMesh.material.emissiveIntensity = 0.3;
        
        // Apply enhanced click effect
        this.buttons[buttonKey].position.z += 0.01;
        this.buttons[buttonKey].scale.set(0.95, 0.95, 1.0);
        
        // Execute callback
        console.log(`MultiplayerMenu: Executing callback for button: ${buttonKey}`);
        switch (buttonKey) {
            case 'singleplayer':
                if (this.callbacks.onSingleplayer) this.callbacks.onSingleplayer();
                
                // Report singleplayer button press to OpenAI voice assistant if available
                if (window.openAIVoice) {
                    window.openAIVoice.reportMenuButtonPress('singleplayer');
                }
                break;
            case 'host':
                if (this.callbacks.onHost) this.callbacks.onHost();
                break;
            case 'join':
                if (this.callbacks.onJoin) this.callbacks.onJoin();
                break;
            case 'back':
                if (this.callbacks.onBack) this.callbacks.onBack();
                break;
        }
        
        // Reset button state after 300ms (matching the transition duration)
        console.log(`MultiplayerMenu: Setting timeout to reset button ${buttonKey} in 300ms`);
        setTimeout(() => {
            if (this.buttons[buttonKey]) {
                this.buttons[buttonKey].position.z -= 0.01;
                this.buttons[buttonKey].scale.set(1.0, 1.0, 1.0);
                this.unhighlightButton(buttonKey);
                console.log(`MultiplayerMenu: Button ${buttonKey} reset completed`);
            }
        }, 300);
    }
    
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    
    show() {
        // Store the original opacity values for materials
        this.menuGroup.traverse((child) => {
            if (child.material && child.material.transparent) {
                child.userData.originalOpacity = child.material.opacity;
            }
        });
        
        // Reset the menu position to its original position
        if (this.menuGroup.userData.originalPosition) {
            this.menuGroup.position.copy(this.menuGroup.userData.originalPosition);
            console.log(`MultiplayerMenu: Reset position to original: x=${this.menuGroup.position.x.toFixed(2)}, y=${this.menuGroup.position.y.toFixed(2)}, z=${this.menuGroup.position.z.toFixed(2)}`);
        } else {
            // If original position wasn't stored, reset to default
            this.menuGroup.position.set(0, 1.6, -1.0);
            console.log("MultiplayerMenu: Original position not found, reset to default position");
        }
        
        // Reset menu rotation completely
        this.menuGroup.rotation.set(0, 0, 0);
        
        // Fully reset all button positions and scales to prevent cumulative effects
        for (const key in this.buttons) {
            if (this.buttons[key]) {
                // Reset position Y to exactly what's in the stored value
                if (this.buttons[key].userData.originalY !== undefined) {
                    this.buttons[key].position.y = this.buttons[key].userData.originalY;
                    // Also ensure Z position is reset (in case it was modified during button press)
                    this.buttons[key].position.z = 0.02; // Original Z from createButton
                }
                
                // Reset scale to exactly 1
                this.buttons[key].scale.set(0.01, 0.01, 0.01); // Will be animated back to 1
                
                // Reset rotation
                this.buttons[key].rotation.set(0, 0, 0);
            }
        }
        
        // Store original button positions after reset to ensure they're correct
        this.storeButtonPositions();
        
        // Make menu visible
        this.menuGroup.visible = true;
        this.isVisible = true;
        this.showTime = Date.now();
        
        // Force immediate text recreation before the animation starts
        this.forceTextUpdate();
        
        // Start animation
        this.menuGroup.scale.set(0.01, 0.01, 0.01);
        this.animationDirection = 'in';
        this.animationStartTime = Date.now();
        this.isAnimating = true;
        
        // Trigger animation
        this.animateMenuFunction();
        
        console.log(`MultiplayerMenu: Shown with animation at ${this.showTime}, input will be enabled after ${this.showDelay}ms`);
    }
    
    hide() {
        // Only try to animate if animation function exists
        if (this.animateMenuFunction) {
            // Start exit animation
            this.animationDirection = 'out';
            this.animationStartTime = Date.now();
            this.isAnimating = true;
            
            // Trigger animation
            this.animateMenuFunction();
        } else {
            // Fallback if animation not set up yet
            this.menuGroup.visible = false;
        }
        
        // Menu will be fully hidden when animation completes
        this.isVisible = false;
        
        // Reset any highlighted button
        if (this.currentHoveredButton) {
            this.unhighlightButton(this.currentHoveredButton);
        }
        
        // Log for debugging
        console.log("MultiplayerMenu: Hidden, cleaning up button states");
    }
    
    dispose() {
        // Clean up resources
        for (const buttonKey in this.buttons) {
            const button = this.buttons[buttonKey];
            if (button) {
                button.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                });
            }
        }
        
        // Remove from scene
        if (this.scene) {
            this.scene.remove(this.menuGroup);
        }
        
        // Clear any animations in progress
        this.isAnimating = false;
        this.isVisible = false;
        
        console.log("MultiplayerMenu: Resources disposed");
    }
    
    // Method to check for mouse hover
    checkMouseIntersection(mouseX, mouseY, camera) {
        if (!this.isVisible) return null;
        
        // Skip intersection checks if we're still in the initial delay period
        const now = Date.now();
        if (now - this.showTime < this.showDelay) {
            return null;
        }
        
        // Create a raycaster for mouse picking
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(mouseX, mouseY);
        raycaster.setFromCamera(mouse, camera);
        
        // Check intersection with each button
        for (const [key, button] of Object.entries(this.buttons)) {
            const buttonMesh = button.children[0];
            const intersects = raycaster.intersectObject(buttonMesh);
            
            if (intersects.length > 0) {
                return {
                    button: key,
                    mesh: buttonMesh
                };
            }
        }
        
        return null;
    }
    
    setupAnimation() {
        // Add this method to the animation loop in Game.js
        const animateMenu = () => {
            if (this.isAnimating) {
                const now = Date.now();
                const elapsed = now - this.animationStartTime;
                const progress = Math.min(elapsed / this.animationDuration, 1);
                
                // Cubic ease-out animation curve
                const eased = 1 - Math.pow(1 - progress, 3);
                
                if (this.animationDirection === 'in') {
                    // Animate in
                    const scale = 0.01 + (this.menuGroup.userData.originalScale.x - 0.01) * eased;
                    this.menuGroup.scale.set(scale, scale, scale);
                    
                    // Add rotation effect during entry
                    const maxRotation = 0.1; // Maximum rotation in radians
                    const rotationX = maxRotation * (1 - eased);
                    const rotationY = maxRotation * 0.5 * (1 - eased);
                    this.menuGroup.rotation.x = rotationX;
                    this.menuGroup.rotation.y = rotationY;
                    
                    // Optional: Add a slight bounce effect
                    if (progress > 0.8) {
                        const bounce = Math.sin((progress - 0.8) * 5 * Math.PI) * 0.03;
                        this.menuGroup.scale.set(scale + bounce, scale + bounce, scale + bounce);
                    }
                    
                    // Animate opacity for materials
                    this.menuGroup.traverse((child) => {
                        if (child.material && child.material.transparent) {
                            child.material.opacity = eased * child.userData.originalOpacity;
                        }
                    });
                    
                    // Staggered animation for buttons
                    const buttonDelay = 100; // ms between each button appearing
                    const buttonKeys = ['singleplayer', 'host', 'join', 'back'];
                    
                    buttonKeys.forEach((key, index) => {
                        if (this.buttons[key]) {
                            // Calculate delayed progress for each button
                            const buttonDelayMs = index * buttonDelay;
                            const buttonElapsed = elapsed - buttonDelayMs;
                            const buttonProgress = Math.max(0, Math.min(buttonElapsed / this.animationDuration, 1));
                            const buttonEased = 1 - Math.pow(1 - buttonProgress, 3);
                            
                            // Apply staggered scale to each button
                            if (buttonProgress <= 0) {
                                this.buttons[key].scale.set(0.01, 0.01, 0.01);
                            } else {
                                const buttonScale = 0.01 + 0.99 * buttonEased;
                                this.buttons[key].scale.set(buttonScale, buttonScale, buttonScale);
                                
                                // Add slight upward movement as buttons appear
                                const yOffset = (1 - buttonEased) * 0.1;
                                this.buttons[key].position.y = this.buttons[key].userData.originalY - yOffset;
                                
                                // Add a slight rotation to each button
                                const buttonRotation = (1 - buttonEased) * 0.2;
                                this.buttons[key].rotation.y = buttonRotation;
                            }
                        }
                    });
                } else {
                    // Animate out
                    const scale = this.menuGroup.userData.originalScale.x - (this.menuGroup.userData.originalScale.x - 0.01) * eased;
                    this.menuGroup.scale.set(scale, scale, scale);
                    
                    // Add rotation effect during exit (opposite direction)
                    const maxRotation = 0.1; // Maximum rotation in radians
                    const rotationX = -maxRotation * eased;
                    const rotationY = -maxRotation * 0.5 * eased;
                    this.menuGroup.rotation.x = rotationX;
                    this.menuGroup.rotation.y = rotationY;
                    
                    // Staggered exit animation for buttons (reverse order)
                    const buttonDelay = 50; // ms between each button disappearing (faster than entry)
                    const buttonKeys = ['back', 'join', 'host', 'singleplayer']; // Reverse order
                    
                    buttonKeys.forEach((key, index) => {
                        if (this.buttons[key]) {
                            // Calculate delayed progress for each button
                            const buttonDelayMs = index * buttonDelay;
                            const buttonElapsed = elapsed - buttonDelayMs;
                            const buttonProgress = Math.max(0, Math.min(buttonElapsed / (this.animationDuration * 0.7), 1));
                            const buttonEased = 1 - Math.pow(1 - buttonProgress, 3);
                            
                            // Apply staggered fade to each button
                            const buttonScale = 1 - 0.99 * buttonEased;
                            this.buttons[key].scale.set(buttonScale, buttonScale, buttonScale);
                            
                            // Add slight downward movement as buttons disappear
                            const yOffset = buttonEased * 0.1;
                            this.buttons[key].position.y = this.buttons[key].userData.originalY - yOffset;
                            
                            // Add a slight rotation to each button on exit
                            const buttonRotation = buttonEased * -0.2; // Opposite direction
                            this.buttons[key].rotation.y = buttonRotation;
                        }
                    });
                    
                    // Animate opacity for materials
                    this.menuGroup.traverse((child) => {
                        if (child.material && child.material.transparent) {
                            child.material.opacity = (1 - eased) * child.userData.originalOpacity;
                        }
                    });
                }
                
                // Check if animation is complete
                if (progress >= 1) {
                    this.isAnimating = false;
                    
                    // If animating out, actually hide the menu
                    if (this.animationDirection === 'out') {
                        this.menuGroup.visible = false;
                    } else {
                        // Reset rotations when entry animation completes
                        this.menuGroup.rotation.x = 0;
                        this.menuGroup.rotation.y = 0;
                        
                        // Reset button rotations
                        for (const key in this.buttons) {
                            if (this.buttons[key]) {
                                this.buttons[key].rotation.y = 0;
                            }
                        }
                        
                        // Extra safety check - ensure button text is visible after animation completes
                        if (this.isVisible) {
                            console.log("MultiplayerMenu: Animation complete - safety text refresh");
                            this.recreateButtonTextCanvas(this.buttons.singleplayer, 'SINGLE PLAYER');
                            this.recreateButtonTextCanvas(this.buttons.host, 'HOST GAME');
                            this.recreateButtonTextCanvas(this.buttons.join, 'QUICK JOIN');
                            this.recreateButtonTextCanvas(this.buttons.back, 'BACK');
                        }
                    }
                }
                
                // Continue animation in next frame
                if (this.isAnimating) {
                    requestAnimationFrame(animateMenu);
                }
            }
        };
        
        // Store the animation function for cleanup
        this.animateMenuFunction = animateMenu;
    }
    
    // Method to store original button positions
    storeButtonPositions() {
        for (const key in this.buttons) {
            if (this.buttons[key]) {
                this.buttons[key].userData.originalY = this.buttons[key].position.y;
                this.buttons[key].userData.originalScale = new THREE.Vector3(1, 1, 1);
                this.buttons[key].userData.originalRotation = this.buttons[key].rotation.y;
            }
        }
        
        // Store original menu rotation
        this.menuGroup.userData.originalRotationX = this.menuGroup.rotation.x;
        this.menuGroup.userData.originalRotationY = this.menuGroup.rotation.y;
    }
}
