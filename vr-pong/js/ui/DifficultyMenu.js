import * as THREE from 'three';
// Import FontLoader and TextGeometry from addons
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export class DifficultyMenu {
    constructor(scene) {
        this.scene = scene;
        this.isVisible = false;
        this.menuGroup = new THREE.Group();
        this.buttons = {
            easy: null,
            medium: null,
            expert: null,
            back: null
        };
        
        // For debouncing button presses
        this.lastButtonPressed = '';
        this.buttonCooldown = 300; // ms
        this.lastPressTime = 0;
        
        // Add a buffer time when menu first appears to prevent accidental button presses
        this.showTime = 0;
        this.showDelay = 1000; // 1 second delay after showing before accepting input
        
        // Track currently hovered button
        this.currentHoveredButton = null;
        
        // Enhanced button properties with modern color scheme
        this.buttonColors = {
            easy: {
                base: 0x4CAF50, // Green
                hover: 0x66BB6A,
                click: 0x388E3C
            },
            medium: {
                base: 0xFFA000, // Amber/Yellow
                hover: 0xFFB300,
                click: 0xFF8F00
            },
            expert: {
                base: 0xF44336, // Red
                hover: 0xEF5350,
                click: 0xC62828
            },
            back: {
                base: 0x607D8B, // Gray/Blue
                hover: 0x78909C,
                click: 0x455A64
            }
        };
        
        this.buttonMaterialParams = {
            metalness: 0.5,
            roughness: 0.3
        };
        
        // Initialize menu
        this.createMenu();
        
        // Add menu to scene
        this.scene.add(this.menuGroup);
        
        // Default empty callbacks
        this.callbacks = {
            onEasy: () => {},
            onMedium: () => {},
            onExpert: () => {},
            onBack: () => {}
        };
        
        // Preload font
        this.fontLoaded = false;
        this.preloadOrbitronFont();
        
        // Make sure menu is hidden initially
        this.menuGroup.visible = false;
    }
    
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
    
    updateButtonText() {
        // Only update if font is loaded and buttons exist
        if (!this.fontLoaded || !this.buttons.easy) return;
        
        // Update button text for each button
        this.updateButtonTextCanvas(this.buttons.easy, 'EASY', 'Slow AI paddle');
        this.updateButtonTextCanvas(this.buttons.medium, 'MEDIUM', 'Normal speed AI');
        this.updateButtonTextCanvas(this.buttons.expert, 'EXPERT', 'Fast AI paddle');
        this.updateButtonTextCanvas(this.buttons.back, 'BACK');
    }
    
    updateButtonTextCanvas(buttonGroup, text, description = '') {
        // Get the text mesh from the button group
        const textMesh = buttonGroup.children.find(child => child instanceof THREE.Mesh && 
                                                 child.material.map && 
                                                 child.material.map instanceof THREE.CanvasTexture);
        
        if (!textMesh) return;
        
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
        
        // Set font based on font loading status
        context.font = `bold 32px Orbitron, Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Add shadow to text
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
        
        // Draw the main text in the top portion
        context.fillText(text, canvas.width / 2, canvas.height * 0.35);
        
        // Draw the description text if provided
        if (description) {
            context.font = `16px Orbitron, Arial, sans-serif`;
            context.fillText(description, canvas.width / 2, canvas.height * 0.7);
        }
        
        // Add subtle glow
        context.globalCompositeOperation = 'lighter';
        context.shadowColor = 'rgba(255, 255, 255, 0.5)';
        context.shadowBlur = 3;
        context.fillStyle = 'rgba(255, 255, 255, 0.2)';
        
        // Redraw with glow
        context.font = `bold 32px Orbitron, Arial, sans-serif`;
        context.fillText(text, canvas.width / 2, canvas.height * 0.35);
        
        if (description) {
            context.font = `16px Orbitron, Arial, sans-serif`;
            context.fillText(description, canvas.width / 2, canvas.height * 0.7);
        }
        
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
        
        // Create title
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
        
        titleContext.fillText('SELECT DIFFICULTY', titleCanvas.width / 2, titleCanvas.height / 2);
        
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
        titleContext.fillText('SELECT DIFFICULTY', titleCanvas.width / 2, titleCanvas.height / 2);
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
        this.buttons.easy = this.createButton('EASY', 0, 0.15, 0.02, 'easy');
        this.menuGroup.add(this.buttons.easy);
        
        this.buttons.medium = this.createButton('MEDIUM', 0, -0.05, 0.02, 'medium');
        this.menuGroup.add(this.buttons.medium);
        
        this.buttons.expert = this.createButton('EXPERT', 0, -0.25, 0.02, 'expert');
        this.menuGroup.add(this.buttons.expert);
        
        this.buttons.back = this.createButton('BACK', 0, -0.45, 0.02, 'back');
        this.menuGroup.add(this.buttons.back);
        
        // Position the menu in front of the player - same position as MultiplayerMenu
        this.menuGroup.position.set(0, 1.6, -1.0);
    }
    
    createButton(text, x, y, z, buttonType) {
        const group = new THREE.Group();
        
        // Create rounded button geometry
        const buttonGeometry = new THREE.BoxGeometry(0.6, 0.15, 0.04);
        
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
        
        // Add subtle bevel to buttons
        const edgeGeometry = new THREE.BoxGeometry(0.62, 0.17, 0.03);
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
        
        // Create text with canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add text - will be updated when font is loaded
        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        const textGeometry = new THREE.PlaneGeometry(0.55, 0.1);
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
    
    // Check for intersection with mouse
    checkMouseIntersection(mouseX, mouseY, camera) {
        if (!this.isVisible) return null;
        
        // Create a raycaster for mouse picking
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (mouseX / window.innerWidth) * 2 - 1,
            -(mouseY / window.innerHeight) * 2 + 1
        );
        
        raycaster.setFromCamera(mouse, camera);
        
        // Check intersections with each button
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
    
    // Highlight a button on hover
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
    
    // Unhighlight a button
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
    
    // Press a button with debounce
    pressButton(buttonKey) {
        const now = Date.now();
        
        // Skip intersection checks if we're still in the initial delay period
        if (now - this.showTime < this.showDelay) {
            return;
        }
        
        // Debounce to prevent multiple rapid presses
        if (now - this.lastPressTime < this.buttonCooldown) {
            return;
        }
        
        if (!this.buttons[buttonKey]) return;
        
        this.lastPressTime = now;
        this.lastButtonPressed = buttonKey;
        
        // Get the button mesh
        const buttonGroup = this.buttons[buttonKey];
        const buttonMesh = buttonGroup.children[0];
        
        // Visual feedback - press animation
        buttonMesh.material.color.setHex(buttonMesh.userData.clickColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.clickColor);
        buttonGroup.position.z -= 0.01;
        
        // Execute the callback based on button type
        console.log(`Difficulty ${buttonKey} selected`);
        switch (buttonKey) {
            case 'easy':
                if (this.callbacks.onEasy) this.callbacks.onEasy();
                break;
            case 'medium':
                if (this.callbacks.onMedium) this.callbacks.onMedium();
                break;
            case 'expert':
                if (this.callbacks.onExpert) this.callbacks.onExpert();
                break;
            case 'back':
                if (this.callbacks.onBack) this.callbacks.onBack();
                break;
        }
        
        // Reset button state after a delay
        setTimeout(() => {
            if (this.buttons[buttonKey]) {
                buttonMesh.material.color.setHex(buttonMesh.userData.originalColor);
                buttonMesh.material.emissive.setHex(buttonMesh.userData.originalColor);
                buttonGroup.position.z += 0.01;
            }
        }, 200);
    }
    
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    
    show() {
        this.isVisible = true;
        this.menuGroup.visible = true;
        this.showTime = Date.now();
        console.log('Difficulty selection menu shown at', this.showTime);
    }
    
    hide() {
        this.isVisible = false;
        this.menuGroup.visible = false;
        
        // Reset any highlighted buttons when hiding the menu
        if (this.currentHoveredButton) {
            this.unhighlightButton(this.currentHoveredButton);
        }
    }
    
    dispose() {
        // Clean up resources when no longer needed
        for (const buttonKey in this.buttons) {
            const button = this.buttons[buttonKey];
            if (button) {
                // Dispose of geometries and materials
                if (button.children[0]) {
                    button.children[0].geometry.dispose();
                    button.children[0].material.dispose();
                }
                if (button.children[1]) {
                    button.children[1].geometry.dispose();
                    button.children[1].material.dispose();
                }
            }
        }
        
        this.scene.remove(this.menuGroup);
    }
} 