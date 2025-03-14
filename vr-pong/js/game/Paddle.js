import * as THREE from 'three';

export class Paddle {
    constructor(scene, isAI = false, paddleIndex = 0) {
        this.scene = scene;
        this.isAI = isAI;
        this.width = 0.3;      // Keep width the same for reasonable hit area
        this.height = 0.1;     // Keep height the same for visibility
        this.depth = 0.02;     // Make it much thinner (was 0.1)
        this.targetPosition = new THREE.Vector3();
        this.smoothSpeed = 0.45; // Increased from 0.35 for even faster AI movement
        this.lastPredictedX = 0;
        this.lastUpdateTime = 0;
        this.updateInterval = 25; // Update more frequently (was 30) for faster reactions
        this.initialSpeed = 0.015;
        this.currentSpeed = this.initialSpeed;
        this.speedIncrement = 0.001; // Small increment for AI speed
        this.maxSpeed = 0.05; // Increased maximum speed to 0.05 (was 0.04)
        this.predictionAheadFactor = 0.2; // New parameter for lookahead prediction
        
        // Add slowdown variables
        this.isSlowedDown = false;
        this.slowdownFactor = 0.3; // How much to slow down (30% of normal speed)
        this.slowdownDuration = 0; // Current duration of slowdown in ms
        this.maxSlowdownDuration = 1500; // Maximum slowdown duration in ms
        this.lastSlowdownCheck = 0;
        this.slowdownCheckInterval = 5000; // Check every 5 seconds if we should slow down
        this.slowdownChance = 0.15; // 15% chance of slowing down when checked
        
        // Add ownership tracking
        this.paddleIndex = paddleIndex; // 0 for first paddle, 1 for second paddle
        this.ownerId = null; // Stores the player's ID who owns this paddle
        this.ownerIsHost = false; // Whether the owner is the host or not
        
        this.createPaddle();
    }

    createPaddle() {
        const paddleGeometry = new THREE.BoxGeometry(0.3, 0.2, this.depth);
        
        // Default neutral color when no one owns the paddle
        const neutralColor = 0x888888;
        
        this.paddleMaterial = new THREE.MeshStandardMaterial({
            color: neutralColor,
            emissive: neutralColor,
            emissiveIntensity: 0.5,
            metalness: 0.9,
            roughness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        this.paddle = new THREE.Mesh(paddleGeometry, this.paddleMaterial);
        
        // Use fixed Z positions to ensure paddles are always on opposite sides
        // paddleIndex 0 (near end), paddleIndex 1 (far end)
        const zPosition = this.paddleIndex === 1 ? -1.9 : -0.1;
        this.paddle.position.set(0, 0.9, zPosition);

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(0.31, 0.21, this.depth + 0.01);
        this.glowMaterial = new THREE.MeshBasicMaterial({
            color: neutralColor,
            transparent: true,
            opacity: 0.3
        });
        
        this.glow = new THREE.Mesh(glowGeometry, this.glowMaterial);
        this.paddle.add(this.glow);

        // Add energy field effect
        const fieldGeometry = new THREE.BoxGeometry(0.32, 0.22, 0.001);
        this.fieldMaterial = new THREE.MeshBasicMaterial({
            color: neutralColor,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        // Add energy field to front and back
        this.frontField = new THREE.Mesh(fieldGeometry, this.fieldMaterial);
        this.frontField.position.z = this.depth / 2 + 0.001;
        this.paddle.add(this.frontField);

        this.backField = new THREE.Mesh(fieldGeometry, this.fieldMaterial);
        this.backField.position.z = -(this.depth / 2 + 0.001);
        this.paddle.add(this.backField);

        this.scene.add(this.paddle);
    }

    // Claim ownership of this paddle
    claimOwnership(playerId, isHost) {
        this.ownerId = playerId;
        this.ownerIsHost = isHost;
        
        // Change color based on ownership
        const ownerColor = isHost ? 0x0088ff : 0xff8800; // Blue for host, Orange for guest
        
        // Update all materials
        this.paddleMaterial.color.setHex(ownerColor);
        this.paddleMaterial.emissive.setHex(ownerColor);
        this.glowMaterial.color.setHex(ownerColor);
        this.fieldMaterial.color.setHex(ownerColor);
        
        console.log(`Paddle ${this.paddleIndex} claimed by ${isHost ? 'Host' : 'Guest'} player ${playerId}`);
        
        return true;
    }
    
    // Release ownership
    releaseOwnership() {
        if (this.ownerId) {
            console.log(`Paddle ${this.paddleIndex} released by ${this.ownerIsHost ? 'Host' : 'Guest'}`);
            this.ownerId = null;
            
            // Reset to neutral color
            const neutralColor = 0x888888;
            this.paddleMaterial.color.setHex(neutralColor);
            this.paddleMaterial.emissive.setHex(neutralColor);
            this.glowMaterial.color.setHex(neutralColor);
            this.fieldMaterial.color.setHex(neutralColor);
        }
    }
    
    // Set paddle color to a specific hex color
    setColor(hexColor) {
        // Update all materials with the specified color
        this.paddleMaterial.color.setHex(hexColor);
        this.paddleMaterial.emissive.setHex(hexColor);
        this.glowMaterial.color.setHex(hexColor);
        this.fieldMaterial.color.setHex(hexColor);
        
        console.log(`Paddle ${this.paddleIndex} color set to ${hexColor.toString(16)}`);
    }
    
    // Check if paddle is owned
    isOwned() {
        return this.ownerId !== null;
    }
    
    // Check if this player owns the paddle
    isOwnedBy(playerId) {
        return this.ownerId === playerId;
    }

    getPaddle() {
        return this.paddle;
    }

    getPosition() {
        return this.paddle.position;
    }

    setPosition(position) {
        // Preserve Z position when updating paddle position
        const currentZ = this.paddle.position.z;
        this.paddle.position.set(position.x, position.y, currentZ);
    }

    lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    // Add a new method to check if we should apply a random slowdown
    checkRandomSlowdown(currentTime) {
        if (!this.isAI) return; // Only apply to AI paddle

        // Check if we need to end the current slowdown
        if (this.isSlowedDown && currentTime - this.slowdownDuration > this.maxSlowdownDuration) {
            this.isSlowedDown = false;
            console.log('AI paddle: Speed restored to normal');
            
            // Emit an event that the slowdown ended
            const event = new CustomEvent('ai-slowdown-ended');
            document.dispatchEvent(event);
        }

        // Only check for new slowdown if not currently slowed and enough time has passed
        if (!this.isSlowedDown && currentTime - this.lastSlowdownCheck > this.slowdownCheckInterval) {
            this.lastSlowdownCheck = currentTime;
            
            // Random chance to start a slowdown
            if (Math.random() < this.slowdownChance) {
                this.isSlowedDown = true;
                this.slowdownDuration = currentTime;
                console.log('AI paddle: Temporarily slowing down');
                
                // Emit an event that the AI has slowed down
                const event = new CustomEvent('ai-slowdown-started', {
                    detail: {
                        duration: this.maxSlowdownDuration
                    }
                });
                document.dispatchEvent(event);
            }
        }
    }

    /**
     * Update AI paddle to follow the ball
     * @param {THREE.Object3D} ball - The ball to track
     * @param {number} difficulty - The difficulty level (between 0 and 1, default 0.25)
     */
    updateAI(ball, difficulty = 0.25) { // Difficulty parameter affects AI reaction speed
        if (!this.isAI) return;

        const currentTime = performance.now();
        
        // Check if we should apply a random slowdown
        this.checkRandomSlowdown(currentTime);
        
        // Get ball position and velocity for prediction
        const ballPosition = ball.position;
        let ballVelocity = new THREE.Vector3(0, 0, 0);
        
        // Try to get ball velocity if available
        if (ball.ballVelocity) {
            ballVelocity = ball.ballVelocity;
        } else if (ball.getBallVelocity && typeof ball.getBallVelocity === 'function') {
            ballVelocity = ball.getBallVelocity();
        }
        
        // Predict where the ball will be - more advanced prediction
        let targetX = ballPosition.x;
        
        // If the ball is moving toward the AI paddle, predict where it will intersect
        if (ballVelocity && ballVelocity.z < 0) {
            // Calculate time to reach paddle plane based on current Z position and velocity
            const distanceToAI = Math.abs(ballPosition.z - (-1.9));
            const timeToReach = Math.abs(distanceToAI / ballVelocity.z);
            
            // For Expert level, use full prediction ahead factor
            // For lower difficulties, reduce prediction accuracy
            const scaledPredictionFactor = this.predictionAheadFactor * (difficulty / 0.25);
            
            // Predict X position on arrival
            let predictedX = ballPosition.x + (ballVelocity.x * timeToReach * scaledPredictionFactor);
            
            // Apply some limits to the prediction to prevent over-committing
            predictedX = THREE.MathUtils.clamp(predictedX, -0.5, 0.5);
            
            // Use predicted position
            targetX = predictedX;
        }

        // At expert level (0.25), use the original update interval
        // For lower difficulties, update less frequently
        const updateIntervalScaled = this.updateInterval * (0.25 / Math.max(0.1, difficulty));
        
        // Update prediction less frequently to allow AI to commit to movements
        if (currentTime - this.lastUpdateTime > updateIntervalScaled) {
            // Calculate base target position with prediction
            let newTargetX = targetX;

            // Add random offset - more randomness for lower difficulties
            const randomAmount = 0.005 + ((0.25 - difficulty) * 0.02);
            const randomOffset = (Math.random() - 0.5) * randomAmount;
            newTargetX += randomOffset;

            // Smooth transition to new target - less responsive at lower difficulties
            const updateSpeed = 0.7 * (difficulty / 0.25);
            this.lastPredictedX = this.lerp(
                this.lastPredictedX,
                newTargetX,
                Math.max(0.1, updateSpeed)
            );

            this.lastUpdateTime = currentTime;
        }

        // Calculate smooth movement
        const currentX = this.paddle.position.x;
        const diff = this.lastPredictedX - currentX;
        
        // Use cubic easing for more aggressive acceleration/deceleration
        const direction = Math.sign(diff);
        const distance = Math.abs(diff);
        
        // Scale speed by difficulty - expert (0.25) gets full speed
        let speed = Math.min(distance * distance * 5, difficulty); 
        
        // Apply slowdown if active
        if (this.isSlowedDown) {
            speed *= this.slowdownFactor;
        }

        // Move towards target with higher precision for expert AI, less for lower difficulties
        const precisionThreshold = 0.0005 + ((0.25 - difficulty) * 0.001);
        if (Math.abs(diff) > precisionThreshold) {
            const movement = direction * speed;
            
            // Scale smooth speed by difficulty level - full smoothSpeed at expert level
            const smoothSpeedScaled = this.smoothSpeed * (difficulty / 0.25);
            
            const newX = this.lerp(
                currentX,
                currentX + movement,
                this.isSlowedDown ? smoothSpeedScaled * this.slowdownFactor : smoothSpeedScaled
            );

            // Apply position with constraints
            this.paddle.position.x = THREE.MathUtils.clamp(
                newX,
                -0.6,
                0.6
            );
        }
    }
}
