import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRController } from '../controllers/VRController.js';
import { GameEnvironment } from '../environment/GameEnvironment.js';
import { Paddle } from './Paddle.js';
import { Ball } from './Ball.js';
import { SoundManager } from '../audio/SoundManager.js';
import { StartButton } from '../ui/StartButton.js';
import { ScoreDisplay } from '../ui/ScoreDisplay.js';
import { Timer } from '../ui/Timer.js';
import { MultiplayerMenu } from '../ui/MultiplayerMenu.js';
import { MultiplayerManager } from '../network/MultiplayerManager.js';

export class Game {
    constructor() {
        // Initialize Three.js scene and renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        
        // Game state
        this.isGameStarted = false;
        this.isMultiplayer = false;
        this.isLocalPlayer = true; // Player is host by default
        this.isInVR = false; // Track if user is in VR
        
        // Button interaction state tracking
        this.lastButtonPressController = null;
        this.lastButtonPressTime = 0;
        
        // Scoring
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Clock for animation
        this.clock = new THREE.Clock();
        
        // Create a group for player elements
        this.playerGroup = new THREE.Group();
        this.scene.add(this.playerGroup);
        
        // For desktop mode, camera is in the scene
        // For VR mode, camera will be moved to playerGroup
        this.scene.add(this.camera);
        
        // Desktop input tracking
        this.desktopControls = {
            keys: {
                'ArrowLeft': false,
                'ArrowRight': false,
                'a': false,
                'd': false,
                ' ': false
            },
            isMouseDown: false,
            mouseX: 0,
            mouseY: 0
        };
        
        this.init();
        this.createGameElements();
        this.setupVR();
        this.setupDesktopControls();
        
        // Initialize multiplayer manager
        this.multiplayerManager = new MultiplayerManager(this);
        
        // Set up multiplayer menu callbacks (will create the menu)
        this.setupMultiplayerCallbacks();
        
        this.animate();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        document.body.appendChild(VRButton.createButton(this.renderer));

        // Position camera for desktop view
        this.camera.position.set(0, 1.7, 0.8);
        this.camera.lookAt(0, 0.9, -1.0); // Look at the center of the table

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupVR() {
        // Define a standard floor height for VR
        const floorHeight = 0.1; // Lowered by 1.5 units from previous value (1.6)
        
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('Setting up VR session');
            
            // Ensure the camera is in the playerGroup for locomotion
            if (!this.playerGroup.children.includes(this.camera)) {
                // Reset position for VR
                this.camera.position.set(0, 0, 0);
                
                // Remove camera from scene if it's there
                this.scene.remove(this.camera);
                
                // Add camera to player group
                this.playerGroup.add(this.camera);
                
                // Position the player group for good initial view
                // X and Z position the player in the play area, Y sets the floor height
                this.playerGroup.position.set(0, floorHeight, 0.8); 
                this.playerGroup.lookAt(0, floorHeight, -1.0);
                
                console.log('Camera attached to player group for VR locomotion');
            }
            
            // Store initial Y position to help maintain consistent floor height
            this.initialFloorHeight = this.playerGroup.position.y;
        });
        
        // Set session end event to restore desktop view
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('VR session ended, restoring desktop view');
            
            // Restore desktop camera setup when exiting VR
            this.playerGroup.remove(this.camera);
            this.scene.add(this.camera);
            
            // Restore desktop camera position and orientation
            this.camera.position.set(0, 1.7, 0.8);
            this.camera.lookAt(0, 0.9, -1.0);
        });

        // Initialize VR controllers
        this.vrController = new VRController(this.renderer, this.playerGroup);
    }

    setupMultiplayerCallbacks() {
        this.multiplayerMenu = new MultiplayerMenu(this.scene);
        
        // Set up the callbacks for the multiplayer menu buttons
        this.multiplayerMenu.setCallbacks({
            onSinglePlayer: () => {
                console.log("Starting single player game...");
                this.multiplayerMenu.hide();
                
                // Reset existing game state
                this.resetGame();
                
                // Start a single player game against AI
                this.isMultiplayer = false;
                this.isGameStarted = true;
                
                // Reset scores
                this.playerScore = 0;
                this.aiScore = 0;
                this.playerScoreDisplay.updateScore(0);
                this.aiScoreDisplay.updateScore(0);
                
                // Make sure the AI paddle is positioned correctly
                this.aiPaddle.getPaddle().position.z = -1.9;
                this.playerPaddle.getPaddle().position.z = -0.1;
                
                // Start game directly
                this.ball.start();
                this.timer.start();
                if (this.soundManager) {
                    this.soundManager.startBackgroundMusic();
                }
                
                this.showMessage('Single Player Game Started!');
            },
            onHost: () => {
                if (this.multiplayerManager.isConnected) {
                    console.log("Attempting to host a game...");
                    this.multiplayerManager.hostGame();
                    this.multiplayerMenu.hide();
                    // Hide start button until someone joins
                    this.startButton.hide();
                    this.showMessage('Hosting a game. Waiting for players...');
                } else {
                    console.log("Not connected to server");
                    this.showMessage('Not connected to server. Please try again.');
                }
            },
            onJoin: () => {
                if (this.multiplayerManager.isConnected) {
                    console.log("Attempting to join a game...");
                    this.multiplayerManager.quickJoin();
                    this.multiplayerMenu.hide();
                    // Hide start button for guest
                    this.startButton.hide();
                    this.showMessage('Searching for a game to join...');
                } else {
                    console.log("Not connected to server");
                    this.showMessage('Not connected to server. Please try again.');
                }
            },
            onBack: () => {
                // Return to main menu
                console.log("Returning to main menu");
                this.multiplayerMenu.hide();
                this.startButton.show();
            }
        });
    }

    setupDesktopControls() {
        // Add event listeners for keyboard controls
        window.addEventListener('keydown', (event) => {
            if (this.desktopControls.keys.hasOwnProperty(event.key)) {
                this.desktopControls.keys[event.key] = true;
            } else {
                this.desktopControls.keys[event.key] = true;
            }
            
            // Space bar to start game or interact with buttons
            if (event.key === ' ' && !this.isGameStarted) {
                if (this.multiplayerManager.isInMultiplayerGame()) {
                    // If we're in a multiplayer game and we're the host, start the game
                    if (this.multiplayerManager.isHosting()) {
                        console.log("Host starting multiplayer game (desktop)");
                        this.multiplayerManager.startGame();
                        this.startButton.hide();
                    } else {
                        this.showMessage("Waiting for host to start the game...");
                    }
                } else {
                    // Always show multiplayer menu first in desktop mode
                    this.startButton.hide();
                    this.multiplayerMenu.show();
                }
            }
            
            // Handle 'ESC' key to exit menus or pause
            if (event.key === 'Escape') {
                if (this.multiplayerMenu.isVisible) {
                    this.multiplayerMenu.hide();
                    this.startButton.show();
                }
                // Could add pause functionality here
            }
        });
        
        window.addEventListener('keyup', (event) => {
            if (this.desktopControls.keys.hasOwnProperty(event.key)) {
                this.desktopControls.keys[event.key] = false;
            }
        });

        // Add mouse controls for paddle
        window.addEventListener('mousedown', () => {
            this.desktopControls.isMouseDown = true;
        });

        window.addEventListener('mouseup', () => {
            this.desktopControls.isMouseDown = false;
        });
        
        // Track mouse position for desktop paddle control
        window.addEventListener('mousemove', (event) => {
            // Convert mouse position to normalized coordinates (-1 to 1)
            this.desktopControls.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            this.desktopControls.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        // Handle click events for UI buttons
        window.addEventListener('click', (event) => {
            if (!this.isInVR) {
                // Create a raycaster for mouse picking
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2(
                    (event.clientX / window.innerWidth) * 2 - 1,
                    -(event.clientY / window.innerHeight) * 2 + 1
                );
                
                raycaster.setFromCamera(mouse, this.camera);
                
                // Check start button intersection
                if (!this.isGameStarted && this.startButton) {
                    const startButtonIntersects = raycaster.intersectObject(this.startButton.getMesh(), true);
                    if (startButtonIntersects.length > 0) {
                        // Button press is now handled in the StartButton.press() method
                        // which includes cooldown and automatic unhighlight
                        this.startButton.press();
                        
                        // Log button press time for debugging
                        console.log(`Start button pressed at ${Date.now()}`);
                        
                        // Proceed with game logic after successful press
                        if (this.multiplayerManager.isConnected) {
                            // Only show multiplayer menu if not already in a multiplayer game
                            if (!this.multiplayerManager.isInMultiplayerGame()) {
                                console.log('Showing multiplayer menu');
                                this.startButton.hide();
                                this.multiplayerMenu.show();
                            } else if (this.multiplayerManager.isHosting()) {
                                // If already hosting, start the game
                                console.log("Already hosting, starting the game");
                                this.multiplayerManager.startGame();
                            }
                        } else {
                            console.log('Starting single player game');
                            this.isGameStarted = true;
                            this.playerScore = 0;
                            this.aiScore = 0;
                            this.playerScoreDisplay.updateScore(0);
                            this.aiScoreDisplay.updateScore(0);
                            
                            this.ball.start();
                            this.timer.start();
                            if (this.soundManager) {
                                this.soundManager.startBackgroundMusic();
                            }
                            this.startButton.hide();
                        }
                    }
                }
                
                // Check multiplayer menu button intersections
                if (this.multiplayerMenu.isVisible) {
                    const singleplayerIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.singleplayer, true);
                    const hostIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.host, true);
                    const joinIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.join, true);
                    const backIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.back, true);
                    
                    if (singleplayerIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('singleplayer');
                    } else if (hostIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('host');
                    } else if (joinIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('join');
                    } else if (backIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('back');
                    }
                }
            }
        });
    }

    createGameElements() {
        this.environment = new GameEnvironment(this.scene);
        // Initialize sound manager
        this.soundManager = new SoundManager();
        this.table = this.environment.getTable();
        this.scene.add(this.table);

        this.ball = new Ball(this.scene);
        this.playerPaddle = new Paddle(this.scene, false);
        this.aiPaddle = new Paddle(this.scene, true);
        this.startButton = new StartButton(this.scene);
        
        // Initialize game timer
        this.timer = new Timer(this.scene, 180); // 3 minute game timer
        
        // Create message display for notifications
        this.messageDisplay = this.createMessageDisplay();
        this.scene.add(this.messageDisplay);
        this.messageDisplay.visible = false;
        
        this.lastHitTime = 0;
        this.hitCooldown = 100;

        // Track previous ball position for sound triggers
        this.prevBallZ = this.ball.getBall().position.z;
        this.prevBallX = this.ball.getBall().position.x;

        // Initialize score displays
        this.playerScoreDisplay = new ScoreDisplay(
            this.scene,
            new THREE.Vector3(1.90, 1.5, -1),  // Player score on right wall
            new THREE.Euler(0, -Math.PI / 2, 0),
            'PONG MASTER'
        );
        
        this.aiScoreDisplay = new ScoreDisplay(
            this.scene,
            new THREE.Vector3(-1.90, 1.5, -1),  // AI score on left wall
            new THREE.Euler(0, Math.PI / 2, 0),
            'YOU'
        );

        // Create start button
        this.startButton.button.addEventListener('click', () => {
            if (!this.isInVR) {
                // In desktop mode, clicking the start button should show the multiplayer menu
                this.startButton.hide();
                this.multiplayerMenu.show();
            } else {
                // In VR mode, proceed with existing behavior
                if (this.multiplayerManager.isInMultiplayerGame()) {
                    if (this.multiplayerManager.isHosting()) {
                        this.multiplayerManager.startGame();
                    } else {
                        this.showMessage("Waiting for host to start the game...");
                    }
                } else {
                    this.isGameStarted = true;
                    this.playerScore = 0;
                    this.aiScore = 0;
                    this.playerScoreDisplay.updateScore(0);
                    this.aiScoreDisplay.updateScore(0);
                    this.ball.start();
                    this.timer.start();
                    if (this.soundManager) {
                        this.soundManager.startBackgroundMusic();
                    }
                    this.startButton.hide();
                }
            }
        });

        // Create remote controller visualizations for multiplayer
        this.createRemoteControllerVisuals();
    }

    createMessageDisplay() {
        const group = new THREE.Group();
        
        // Create background panel
        const panelGeometry = new THREE.PlaneGeometry(1.5, 0.5);
        const panelMaterial = new THREE.MeshBasicMaterial({
            color: 0x000033,
            transparent: true,
            opacity: 0.7
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        group.add(panel);
        
        // Create text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 256;
        
        context.fillStyle = '#ffffff';
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('', canvas.width / 2, canvas.height / 2);
        
        const textTexture = new THREE.CanvasTexture(canvas);
        this.messageTexture = textTexture;
        this.messageCanvas = canvas;
        this.messageContext = context;
        
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        const textGeometry = new THREE.PlaneGeometry(1.4, 0.4);
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.01;
        group.add(textMesh);
        
        group.position.set(0, 1.3, -1.2);
        
        return group;
    }

    showMessage(message, duration = 3000) {
        // Update message text
        this.messageContext.clearRect(0, 0, this.messageCanvas.width, this.messageCanvas.height);
        this.messageContext.fillStyle = '#ffffff';
        this.messageContext.font = 'bold 24px Arial';
        this.messageContext.textAlign = 'center';
        this.messageContext.textBaseline = 'middle';
        
        // Handle multi-line messages
        const maxWidth = this.messageCanvas.width - 40;
        const words = message.split(' ');
        let lines = [];
        let currentLine = words[0];
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = this.messageContext.measureText(testLine);
            
            if (metrics.width > maxWidth) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        
        // Draw lines
        const lineHeight = 30;
        const startY = this.messageCanvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, i) => {
            this.messageContext.fillText(line, this.messageCanvas.width / 2, startY + i * lineHeight);
        });
        
        this.messageTexture.needsUpdate = true;
        this.messageDisplay.visible = true;
        
        // Hide after duration
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        this.messageTimeout = setTimeout(() => {
            this.messageDisplay.visible = false;
        }, duration);
    }

    updateMultiplayerStatus(isActive, isHost) {
        this.isMultiplayer = isActive;
        this.isLocalPlayer = isHost;
        
        // Update UI labels based on multiplayer status
        if (isActive) {
            this.playerScoreDisplay.updateLabel(isHost ? 'YOU' : 'OPPONENT');
            this.aiScoreDisplay.updateLabel(isHost ? 'OPPONENT' : 'YOU');
        } else {
            this.playerScoreDisplay.updateLabel('PONG MASTER');
            this.aiScoreDisplay.updateLabel('YOU');
        }
    }

    startMultiplayerGame(isHost) {
        console.log(`Starting multiplayer game as ${isHost ? 'host' : 'guest'}`);
        this.isGameStarted = true;
        this.isMultiplayer = true;
        this.isLocalPlayer = isHost;
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        this.playerScoreDisplay.updateScore(0);
        this.aiScoreDisplay.updateScore(0);
        
        // Hide the start button if it's visible
        this.startButton.hide();
        this.multiplayerMenu.hide();
        
        // IMPORTANT: Force paddle positions to correct sides of table
        // Recreate paddles to ensure they are positioned correctly
        if (this.playerPaddle.getPaddle()) {
            this.scene.remove(this.playerPaddle.getPaddle());
        }
        if (this.aiPaddle.getPaddle()) {
            this.scene.remove(this.aiPaddle.getPaddle());
        }
        
        // Create new paddles with correct initial positions
        this.playerPaddle = new Paddle(this.scene, false);
        this.aiPaddle = new Paddle(this.scene, true);
        
        // Double-check positions are correct
        this.playerPaddle.getPaddle().position.z = -0.1; // Near side
        this.aiPaddle.getPaddle().position.z = -1.9;     // Far side
        
        console.log(`Paddle positions set - Player: ${this.playerPaddle.getPaddle().position.z}, AI: ${this.aiPaddle.getPaddle().position.z}`);
        
        // Show a message
        this.showMessage('Game started!', 3000);
        
        // Start the ball if we're the host
        if (isHost) {
            this.ball.start();
        }
        
        // Start the timer and music
        if (this.timer) {
            this.timer.start();
        }
        
        if (this.soundManager) {
            this.soundManager.startBackgroundMusic();
        }
        
        // Add haptic feedback when game starts
        const session = this.renderer.xr.getSession();
        if (session) {
            session.inputSources.forEach(inputSource => {
                if (inputSource.gamepad?.hapticActuators?.[0]) {
                    inputSource.gamepad.hapticActuators[0].pulse(1.0, 50);
                }
            });
        }
    }

    triggerPaddleHaptics(intensity = 1.0, duration = 100) {
        const currentTime = performance.now();
        if (currentTime - this.lastHitTime < this.hitCooldown) {
            return;
        }

        const session = this.renderer.xr.getSession();
        if (!session) return;

        session.inputSources.forEach(inputSource => {
            if (inputSource.gamepad?.hapticActuators?.[0]) {
                inputSource.gamepad.hapticActuators[0].pulse(intensity, duration);
            }
        });

        this.lastHitTime = currentTime;
    }

    updateRemotePaddlePosition(position, isHostPaddle) {
        // Update the appropriate paddle
        const targetPaddle = isHostPaddle ? 
            (this.isLocalPlayer ? this.playerPaddle : this.aiPaddle) :
            (this.isLocalPlayer ? this.aiPaddle : this.playerPaddle);
        
        console.log(`Remote paddle update: ${isHostPaddle ? 'Host' : 'Guest'} paddle position before: ${JSON.stringify({
            x: targetPaddle.getPaddle().position.x,
            y: targetPaddle.getPaddle().position.y,
            z: targetPaddle.getPaddle().position.z
        })}`);
        
        // Only update X and Y positions, preserve Z position
        const currentPos = targetPaddle.getPaddle().position.clone();
        targetPaddle.getPaddle().position.set(position.x, position.y, currentPos.z);
        
        console.log(`Remote paddle update: ${isHostPaddle ? 'Host' : 'Guest'} paddle position after: ${JSON.stringify({
            x: targetPaddle.getPaddle().position.x,
            y: targetPaddle.getPaddle().position.y,
            z: targetPaddle.getPaddle().position.z
        })}`);
    }

    updateRemoteBallPosition(position, velocity) {
        // Only non-host should update ball position from network
        if (!this.isLocalPlayer) {
            this.ball.getBall().position.copy(position);
            this.ball.ballVelocity.copy(velocity);
        }
    }

    updateRemoteScore(hostScore, guestScore) {
        if (this.isLocalPlayer) {
            this.playerScore = hostScore;
            this.aiScore = guestScore;
        } else {
            this.playerScore = guestScore;
            this.aiScore = hostScore;
        }
        
        this.playerScoreDisplay.updateScore(this.playerScore);
        this.aiScoreDisplay.updateScore(this.aiScore);
    }

    handleRemoteCollision(type, position) {
        if (type === 'paddle') {
            // Remote player hit the paddle
            if (this.soundManager) {
                this.soundManager.playPaddleHit();
            }
        } else if (type === 'wall') {
            if (this.soundManager) {
                this.soundManager.playWallHit();
            }
        } else if (type === 'goal') {
            if (this.soundManager) {
                this.soundManager.playLose();
            }
        }
        
        // Create a visual effect at the collision point
    }

    animate() {
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();

            // Check if we're in VR
            this.isInVR = this.renderer.xr.isPresenting;

            if (this.vrController && this.isInVR) {
                this.vrController.checkControllerState(
                    this.vrController.controllers[0],
                    'left',
                    this.playerPaddle.getPaddle()
                );
                this.vrController.checkControllerState(
                    this.vrController.controllers[1],
                    'right',
                    this.playerPaddle.getPaddle()
                );
                
                // Send VR controller data over the network in multiplayer mode
                if (this.isMultiplayer && this.multiplayerManager && this.multiplayerManager.isMultiplayerActive) {
                    this.multiplayerManager.updateControllerData(
                        this.vrController.controllers[0],
                        this.vrController.controllers[1]
                    );
                }
            }

            // Handle desktop controls when not in VR
            if (!this.isInVR && this.isGameStarted) {
                // Handle keyboard paddle movement
                const paddleSpeed = 0.02;
                const paddle = this.playerPaddle.getPaddle();
                
                if (this.desktopControls.keys['ArrowLeft'] || this.desktopControls.keys['a']) {
                    paddle.position.x -= paddleSpeed;
                }
                if (this.desktopControls.keys['ArrowRight'] || this.desktopControls.keys['d']) {
                    paddle.position.x += paddleSpeed;
                }
                
                // Clamp paddle position
                paddle.position.x = THREE.MathUtils.clamp(paddle.position.x, -0.6, 0.6);
            }

            // For desktop mode, use mouse position for paddle control when mouse is down
            if (!this.isInVR && this.desktopControls.isMouseDown) {
                const paddleX = THREE.MathUtils.clamp(this.desktopControls.mouseX * 1.2, -0.6, 0.6);
                this.playerPaddle.getPaddle().position.x = paddleX;
            }

            // For VR mode, ensure controller inputs are properly handled
            if (this.isInVR && this.vrController) {
                const session = this.renderer.xr.getSession();
                if (session) {
                    // Check for input sources and their gamepads
                    for (let i = 0; i < session.inputSources.length; i++) {
                        const inputSource = session.inputSources[i];
                        if (inputSource.gamepad) {
                            const handedness = inputSource.handedness;
                            const controller = handedness === 'left' ? 
                                this.vrController.controllers[0] : 
                                this.vrController.controllers[1];
                            
                            // Ensure controller movement is checked regardless of paddle interaction
                            const side = handedness === 'left' ? 'left' : 'right';
                            this.vrController.checkControllerState(
                                controller,
                                side,
                                this.playerPaddle.getPaddle()
                            );
                        }
                    }
                    
                    // Ensure player stays at the correct floor height
                    if (this.initialFloorHeight !== undefined) {
                        // Smoothly correct any vertical drift
                        const currentY = this.playerGroup.position.y;
                        const targetY = this.initialFloorHeight;
                        if (Math.abs(currentY - targetY) > 0.01) {
                            // Apply a small correction to gradually bring player back to floor level
                            this.playerGroup.position.y = THREE.MathUtils.lerp(
                                currentY, 
                                targetY, 
                                0.1 // Smooth correction factor
                            );
                        }
                    }
                }
            }
                
            // Handle multiplayer menu interactions
            if (this.multiplayerMenu.isVisible && this.isInVR) {
                const leftIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[1]);
                
                // Unhighlight all buttons first
                ['singleplayer', 'host', 'join', 'back'].forEach(buttonKey => {
                    this.multiplayerMenu.unhighlightButton(buttonKey);
                });
                
                if (leftIntersects) {
                    this.multiplayerMenu.highlightButton(leftIntersects.button);
                    // Only process button press on the initial press event, not while holding
                    if (this.vrController.controllers[0].userData.isSelecting && 
                        this.vrController.controllers[0].userData.isNewPress) {
                        console.log(`VR multiplayer menu button press: ${leftIntersects.button}`);
                        this.multiplayerMenu.pressButton(leftIntersects.button);
                    }
                }
                
                if (rightIntersects) {
                    this.multiplayerMenu.highlightButton(rightIntersects.button);
                    // Only process button press on the initial press event, not while holding
                    if (this.vrController.controllers[1].userData.isSelecting && 
                        this.vrController.controllers[1].userData.isNewPress) {
                        console.log(`VR multiplayer menu button press: ${rightIntersects.button}`);
                        this.multiplayerMenu.pressButton(rightIntersects.button);
                    }
                }
            }

            // Get previous ball position for physics/sound calculations
            const prevBallZ = this.ball ? this.ball.getBall().position.z : 0;
            const prevBallX = this.ball ? this.ball.getBall().position.x : 0;

            if (!this.isGameStarted && this.isInVR) {
                const leftIntersects = this.startButton.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.startButton.checkIntersection(this.vrController.controllers[1]);
                
                // Add debug logging for intersections
                if (leftIntersects || rightIntersects) {
                    console.log(`VR controller intersecting start button: Left: ${leftIntersects ? 'YES' : 'NO'}, Right: ${rightIntersects ? 'YES' : 'NO'}`);
                    console.log(`Left controller selecting: ${this.vrController.controllers[0].userData.isSelecting}, Right controller selecting: ${this.vrController.controllers[1].userData.isSelecting}`);
                    console.log(`Left controller isNewPress: ${this.vrController.controllers[0].userData.isNewPress}, Right controller isNewPress: ${this.vrController.controllers[1].userData.isNewPress}`);
                
                    this.startButton.highlight();
                    
                    // Only process button press on the initial press event, not while holding
                    const leftIsNewPress = leftIntersects && this.vrController.controllers[0].userData.isSelecting && this.vrController.controllers[0].userData.isNewPress;
                    const rightIsNewPress = rightIntersects && this.vrController.controllers[1].userData.isSelecting && this.vrController.controllers[1].userData.isNewPress;
                    
                    if (leftIsNewPress || rightIsNewPress) {
                        console.log(`New VR button press detected: Left=${leftIsNewPress}, Right=${rightIsNewPress}`);
                        
                        // The press method now handles the cooldown
                        console.log(`Attempting to press start button at ${Date.now()}`);
                        const pressResult = this.startButton.press();
                        console.log(`Start button press result: ${pressResult ? 'PRESSED' : 'IGNORED (cooldown)'}`);
                        
                        // Store which controller pressed the button
                        if (pressResult) {
                            this.lastButtonPressController = leftIsNewPress ? this.vrController.controllers[0] : this.vrController.controllers[1];
                            this.lastButtonPressTime = Date.now();
                            
                            // Log button press time for debugging
                            console.log(`VR start button pressed at ${this.lastButtonPressTime} by ${leftIsNewPress ? 'LEFT' : 'RIGHT'} controller`);
                            
                            // Schedule a delayed action to check for button release before showing menu
                            setTimeout(() => {
                                // Only proceed if the controller has been fully released
                                if (this.vrController.hasBeenReleasedSince(this.lastButtonPressController, this.lastButtonPressTime)) {
                                    console.log("Controller has been released since button press, safe to proceed");
                                    
                                    // Check if we're showing the multiplayer menu instead of starting
                                    if (this.multiplayerManager.isConnected && !this.multiplayerManager.isInMultiplayerGame()) {
                                        console.log('Showing multiplayer menu in VR');
                                        this.startButton.hide();
                                        this.multiplayerMenu.show();
                                    } else if (this.multiplayerManager.isInMultiplayerGame()) {
                                        // If we're in a multiplayer game and we're the host, start the game
                                        console.log(`Multiplayer game status - isHosting: ${this.multiplayerManager.isHosting()}`);
                                        if (this.multiplayerManager.isHosting()) {
                                            console.log("Host starting multiplayer game");
                                            this.multiplayerManager.startGame();
                                            this.startButton.hide();
                                        } else {
                                            console.log("Player is waiting for host to start game");
                                            this.showMessage("Waiting for host to start the game...");
                                        }
                                    } else {
                                        console.log('Starting single player game in VR');
                                        console.log(`Game state before starting: isGameStarted=${this.isGameStarted}, isGamePaused=${this.isGamePaused}`);
                                        this.isGameStarted = true;
                                        this.playerScore = 0;
                                        this.aiScore = 0;
                                        this.playerScoreDisplay.updateScore(0);
                                        this.aiScoreDisplay.updateScore(0);
                                        
                                        this.ball.start();
                                        this.timer.start();
                                        if (this.soundManager) {
                                            this.soundManager.startBackgroundMusic();
                                        }
                                        this.startButton.hide();
                                        console.log(`Game state after starting: isGameStarted=${this.isGameStarted}, isGamePaused=${this.isGamePaused}`);
                                    }
                                } else {
                                    console.log("Controller has NOT been released since button press, waiting for release");
                                }
                            }, 300); // Wait for button animation to complete
                        }
                    }
                } else {
                    // Unhighlight when not intersecting
                    this.startButton.unhighlight();
                }
            }

            if (this.isGameStarted) {
                // Update the timer if the game is active
                if (!this.isGamePaused) {
                    this.timer.update();
                    
                    // Update ball movement - add this missing logic
                    const collision = this.ball.update(this.clock.getDelta(), this.playerPaddle, this.aiPaddle);
                    
                    // Handle collisions and scoring
                    if (collision === 'player' || collision === 'ai') {
                        // Play sound and trigger haptics for paddle hits
                        if (this.soundManager) {
                            this.soundManager.playPaddleHit();
                        }
                        this.triggerPaddleHaptics(0.7, 50);
                    } else if (collision === 'player_score') {
                        // AI scored
                        this.aiScore++;
                        this.aiScoreDisplay.updateScore(this.aiScore);
                        if (this.soundManager) {
                            this.soundManager.playScore();
                        }
                        // Start the ball again after short delay
                        setTimeout(() => {
                            if (this.isGameStarted && !this.isGamePaused) {
                                this.ball.start();
                            }
                        }, 1000);
                    } else if (collision === 'ai_score') {
                        // Player scored
                        this.playerScore++;
                        this.playerScoreDisplay.updateScore(this.playerScore);
                        if (this.soundManager) {
                            this.soundManager.playScore();
                        }
                        // Start the ball again after short delay
                        setTimeout(() => {
                            if (this.isGameStarted && !this.isGamePaused) {
                                this.ball.start();
                            }
                        }, 1000);
                    }
                    
                    // Update AI paddle for single player mode
                    if (!this.isMultiplayer && this.aiPaddle && this.ball) {
                        console.log("Updating AI paddle position to track ball");
                        this.aiPaddle.updateAI(this.ball.getBall());
                    }
                    
                    // In multiplayer mode, send paddle position to the other player
                    if (this.isMultiplayer && this.multiplayerManager) {
                        // Send our paddle position
                        this.multiplayerManager.updatePaddlePosition(this.playerPaddle);
                        
                        // If we're the host, send ball position too
                        if (this.isLocalPlayer) {
                            this.multiplayerManager.updateBallPosition(
                                this.ball.getBall().position,
                                this.ball.ballVelocity
                            );
                        }
                    }
                }
            }

            this.renderer.render(this.scene, this.camera);
        });
    }

    // Add method to reset the game state
    resetGame() {
        console.log("Resetting game state...");
        
        // Reset game state flags
        this.isGameStarted = false;
        this.isGamePaused = false;
        this.isMultiplayer = false;
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Update score displays
        if (this.playerScoreDisplay) this.playerScoreDisplay.updateScore(0);
        if (this.aiScoreDisplay) this.aiScoreDisplay.updateScore(0);
        
        // Reset ball position
        if (this.ball) this.ball.reset();
        
        // Reset timer
        if (this.timer) this.timer.reset();
        
        // Reset paddle positions
        if (this.playerPaddle && this.playerPaddle.getPaddle()) {
            console.log("Resetting player paddle position to z=-0.1");
            this.playerPaddle.getPaddle().position.set(0, 1.0, -0.1);
        }
        
        if (this.aiPaddle && this.aiPaddle.getPaddle()) {
            console.log("Resetting AI paddle position to z=-1.9");
            this.aiPaddle.getPaddle().position.set(0, 1.0, -1.9);
        }
        
        // Hide multiplayer menu if visible
        if (this.multiplayerMenu && this.multiplayerMenu.isVisible) {
            this.multiplayerMenu.hide();
        }
        
        // Show and reset start button
        if (this.startButton) {
            console.log("Resetting and showing start button");
            this.startButton.reset();
            this.startButton.show();
        }
        
        // Reset sound
        if (this.soundManager) {
            this.soundManager.stopBackgroundMusic();
        }
        
        console.log("Game reset completed");
    }

    // Create visual representations of remote player's controllers
    createRemoteControllerVisuals() {
        // Create group to hold remote controller models
        this.remoteControllerGroup = new THREE.Group();
        this.scene.add(this.remoteControllerGroup);
        
        const controllerModelFactory = new XRControllerModelFactory();
        
        // Left remote controller
        this.remoteControllers = {
            left: new THREE.Group(),
            right: new THREE.Group()
        };
        
        // Create basic controller models
        for (const side of ['left', 'right']) {
            // Add controller grip for model
            const grip = new THREE.Group();
            grip.add(controllerModelFactory.createControllerModel(grip));
            this.remoteControllers[side].add(grip);
            
            // Add a ray to represent controller direction
            const ray = new THREE.Group();
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ]);
            
            const rayMaterial = new THREE.LineBasicMaterial({
                color: side === 'left' ? 0x0088ff : 0xff8800,
                linewidth: 2
            });
            
            const rayLine = new THREE.Line(rayGeometry, rayMaterial);
            rayLine.scale.z = 0.5;
            ray.add(rayLine);
            
            this.remoteControllers[side].add(ray);
            
            // Initially hide remote controllers
            this.remoteControllers[side].visible = false;
            
            // Add to remote controller group
            this.remoteControllerGroup.add(this.remoteControllers[side]);
        }
    }

    // Update remote controller visualizations based on network data
    updateRemoteControllers(data) {
        if (!this.isMultiplayer || !this.remoteControllers) return;
        
        // Only show remote controllers in multiplayer mode
        const isRemotePlayerInVR = (data.isHost !== this.isLocalPlayer);
        if (!isRemotePlayerInVR) return;
        
        // Make remote controllers visible
        this.remoteControllers.left.visible = true;
        this.remoteControllers.right.visible = true;
        
        // Update left controller
        if (data.leftController) {
            const position = data.leftController.position;
            const rotation = data.leftController.rotation;
            this.remoteControllers.left.position.set(position.x, position.y, position.z);
            this.remoteControllers.left.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        
        // Update right controller
        if (data.rightController) {
            const position = data.rightController.position;
            const rotation = data.rightController.rotation;
            this.remoteControllers.right.position.set(position.x, position.y, position.z);
            this.remoteControllers.right.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
    }
}
