import * as THREE from 'three';
// Import FontLoader and TextGeometry from addons
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export class DifficultyMenu {
    constructor(scene) {
        this.scene = scene;
        this.isVisible = false;
        this.buttons = {};
        this.buttonTexts = {};
        this.buttonDescriptions = {};
        this.menu = new THREE.Group();
        this.menu.visible = false;
        
        // For debouncing button presses
        this.lastButtonPressed = '';
        this.buttonCooldown = 300; // ms
        this.lastPressTime = 0;
        
        // Initialize menu
        this.createMenu();
        
        // Add menu to scene
        this.scene.add(this.menu);
        
        // Default empty callbacks
        this.callbacks = {
            onEasy: () => {},
            onMedium: () => {},
            onExpert: () => {},
            onBack: () => {}
        };
        
        // Preload font
        this.preloadOrbitronFont();
    }
    
    preloadOrbitronFont() {
        const fontLoader = new FontLoader();
        fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
            this.font = font;
            
            // Create button text with the loaded font
            this.createButtonTexts();
        });
    }
    
    createButtonTexts() {
        if (!this.font) return;
        
        // Create text for each button
        const createText = (text, position, size = 0.05) => {
            const textGeometry = new TextGeometry(text, {
                font: this.font,
                size: size,
                height: 0.01,
                curveSegments: 12,
                bevelEnabled: false
            });
            
            textGeometry.computeBoundingBox();
            const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
            
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            
            // Center text on the button
            textMesh.position.copy(position);
            textMesh.position.x -= textWidth / 2;
            
            return textMesh;
        };
        
        // Create difficulty level texts
        this.buttonTexts.easy = createText('EASY', new THREE.Vector3(0, 0.08, -0.66));
        this.buttonTexts.medium = createText('MEDIUM', new THREE.Vector3(0, -0.02, -0.66));
        this.buttonTexts.expert = createText('EXPERT', new THREE.Vector3(0, -0.12, -0.66));
        this.buttonTexts.back = createText('BACK', new THREE.Vector3(0, -0.22, -0.66));
        
        // Add short descriptions under each button
        this.buttonDescriptions.easy = createText('Slow AI', new THREE.Vector3(0, 0.03, -0.66), 0.025);
        this.buttonDescriptions.medium = createText('Normal Speed', new THREE.Vector3(0, -0.07, -0.66), 0.025);
        this.buttonDescriptions.expert = createText('Fast AI', new THREE.Vector3(0, -0.17, -0.66), 0.025);
        
        // Add button texts to menu
        for (const key in this.buttonTexts) {
            this.menu.add(this.buttonTexts[key]);
        }
        
        // Add descriptions to menu
        for (const key in this.buttonDescriptions) {
            this.menu.add(this.buttonDescriptions[key]);
        }
    }
    
    createMenu() {
        // Create a panel as background
        const panelGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.01);
        const panelMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x1a1a2e, 
            transparent: true, 
            opacity: 0.85 
        });
        
        // Add a gradient to the panel
        const panelTexture = new THREE.CanvasTexture(this.createGradientTexture());
        panelMaterial.map = panelTexture;
        
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        panel.position.set(0, 0, -0.7);
        this.menu.add(panel);
        
        // Add a title - only create if font is loaded
        if (this.font) {
            const titleGeometry = new TextGeometry('SELECT DIFFICULTY', {
                font: this.font,
                size: 0.06,
                height: 0.01,
                curveSegments: 12,
                bevelEnabled: false
            });
            
            const titleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const title = new THREE.Mesh(titleGeometry, titleMaterial);
            title.position.set(-0.3, 0.18, -0.65);
            this.menu.add(title);
        }
        
        // Create buttons
        const buttonGeometry = new THREE.BoxGeometry(0.7, 0.08, 0.01);
        
        // Easy button - Green color
        const easyMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x4CAF50, 
            transparent: true, 
            opacity: 0.85 
        });
        this.buttons.easy = new THREE.Mesh(buttonGeometry, easyMaterial);
        this.buttons.easy.position.set(0, 0.08, -0.65);
        this.menu.add(this.buttons.easy);
        
        // Medium button - Yellow color
        const mediumMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFFC107, 
            transparent: true, 
            opacity: 0.85 
        });
        this.buttons.medium = new THREE.Mesh(buttonGeometry, mediumMaterial);
        this.buttons.medium.position.set(0, -0.02, -0.65);
        this.menu.add(this.buttons.medium);
        
        // Expert button - Red color
        const expertMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xF44336, 
            transparent: true, 
            opacity: 0.85 
        });
        this.buttons.expert = new THREE.Mesh(buttonGeometry, expertMaterial);
        this.buttons.expert.position.set(0, -0.12, -0.65);
        this.menu.add(this.buttons.expert);
        
        // Back button - Gray color
        const backMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x607D8B, 
            transparent: true, 
            opacity: 0.85 
        });
        this.buttons.back = new THREE.Mesh(buttonGeometry, backMaterial);
        this.buttons.back.position.set(0, -0.22, -0.65);
        this.menu.add(this.buttons.back);
        
        // Keep reference to original button colors
        this.originalButtonColors = {
            easy: this.buttons.easy.material.color.clone(),
            medium: this.buttons.medium.material.color.clone(),
            expert: this.buttons.expert.material.color.clone(),
            back: this.buttons.back.material.color.clone()
        };
        
        // Make sure menu is hidden initially
        this.menu.visible = false;
    }
    
    createGradientTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        
        // Create gradient
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#162447');
        gradient.addColorStop(1, '#1f4068');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        
        return canvas;
    }
    
    // Check for intersection with controller
    checkIntersection(controller) {
        if (!controller || !this.isVisible) return null;
        
        // Create a raycaster from the controller
        const raycaster = new THREE.Raycaster();
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        
        // Check intersections with each button
        for (const buttonKey in this.buttons) {
            const intersects = raycaster.intersectObject(this.buttons[buttonKey]);
            if (intersects.length > 0) {
                return { button: buttonKey, point: intersects[0].point };
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
        for (const buttonKey in this.buttons) {
            const intersects = raycaster.intersectObject(this.buttons[buttonKey]);
            if (intersects.length > 0) {
                return { button: buttonKey, point: intersects[0].point };
            }
        }
        
        return null;
    }
    
    // Highlight a button on hover
    highlightButton(buttonKey) {
        if (this.buttons[buttonKey]) {
            // Brighten the button
            this.buttons[buttonKey].material.color.setRGB(
                Math.min(1.0, this.originalButtonColors[buttonKey].r * 1.2),
                Math.min(1.0, this.originalButtonColors[buttonKey].g * 1.2),
                Math.min(1.0, this.originalButtonColors[buttonKey].b * 1.2)
            );
            
            // Scale up slightly for a hover effect
            this.buttons[buttonKey].scale.set(1.05, 1.05, 1.05);
        }
    }
    
    // Unhighlight a button
    unhighlightButton(buttonKey) {
        if (this.buttons[buttonKey]) {
            // Restore original color
            this.buttons[buttonKey].material.color.copy(this.originalButtonColors[buttonKey]);
            
            // Restore original scale
            this.buttons[buttonKey].scale.set(1, 1, 1);
        }
    }
    
    // Press a button with debounce
    pressButton(buttonKey) {
        const now = Date.now();
        
        // Debounce button presses
        if (now - this.lastPressTime < this.buttonCooldown) {
            return;
        }
        
        // Play animation on the button
        if (this.buttons[buttonKey]) {
            // Flatten the button temporarily
            this.buttons[buttonKey].scale.set(1.1, 0.9, 1.1);
            
            // Make it darker
            this.buttons[buttonKey].material.color.multiplyScalar(0.8);
            
            // Reset button after animation
            setTimeout(() => {
                this.buttons[buttonKey].scale.set(1, 1, 1);
                this.buttons[buttonKey].material.color.copy(this.originalButtonColors[buttonKey]);
            }, 150);
        }
        
        this.lastButtonPressed = buttonKey;
        this.lastPressTime = now;
        
        // Call the appropriate callback
        switch (buttonKey) {
            case 'easy':
                this.callbacks.onEasy();
                break;
            case 'medium':
                this.callbacks.onMedium();
                break;
            case 'expert':
                this.callbacks.onExpert();
                break;
            case 'back':
                this.callbacks.onBack();
                break;
        }
    }
    
    // Set callbacks for button actions
    setCallbacks(callbacks) {
        this.callbacks = {
            ...this.callbacks,
            ...callbacks
        };
    }
    
    // Show the menu
    show() {
        this.menu.visible = true;
        this.isVisible = true;
        console.log('Difficulty menu shown at', Date.now());
    }
    
    // Hide the menu
    hide() {
        this.menu.visible = false;
        this.isVisible = false;
    }
    
    // Clean up resources when done
    dispose() {
        // Remove menu from scene
        this.scene.remove(this.menu);
        
        // Dispose of geometries and materials
        for (const key in this.buttons) {
            this.buttons[key].geometry.dispose();
            this.buttons[key].material.dispose();
        }
        
        // Dispose of text geometries and materials
        for (const key in this.buttonTexts) {
            if (this.buttonTexts[key]) {
                this.buttonTexts[key].geometry.dispose();
                this.buttonTexts[key].material.dispose();
            }
        }
        
        for (const key in this.buttonDescriptions) {
            if (this.buttonDescriptions[key]) {
                this.buttonDescriptions[key].geometry.dispose();
                this.buttonDescriptions[key].material.dispose();
            }
        }
    }
} 