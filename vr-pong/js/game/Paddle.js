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

    updateAI(ball, difficulty = 0.25) { // Increased base difficulty (was 0.15)
        if (!this.isAI) return;

        const currentTime = performance.now();
        
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
            
            // Predict X position on arrival
            let predictedX = ballPosition.x + (ballVelocity.x * timeToReach * this.predictionAheadFactor);
            
            // Apply some limits to the prediction to prevent over-committing
            predictedX = THREE.MathUtils.clamp(predictedX, -0.5, 0.5);
            
            // Use predicted position
            targetX = predictedX;
        }

        // Update prediction less frequently to allow AI to commit to movements
        if (currentTime - this.lastUpdateTime > this.updateInterval) {
            // Calculate base target position with prediction
            let newTargetX = targetX;

            // Add very small random offset for natural movement (reduced further)
            const randomOffset = (Math.random() - 0.5) * 0.005; // Reduced randomness for more precision
            newTargetX += randomOffset;

            // Smooth transition to new target
            this.lastPredictedX = this.lerp(
                this.lastPredictedX,
                newTargetX,
                0.7 // Faster target updating (was 0.5)
            );

            this.lastUpdateTime = currentTime;
        }

        // Calculate smooth movement
        const currentX = this.paddle.position.x;
        const diff = this.lastPredictedX - currentX;
        
        // Use cubic easing for more aggressive acceleration/deceleration
        const direction = Math.sign(diff);
        const distance = Math.abs(diff);
        let speed = Math.min(distance * distance * 5, difficulty); // Increased acceleration factor (was 4)

        // Move towards target with higher precision for difficult AI
        if (Math.abs(diff) > 0.0005) { // Reduced threshold for higher precision
            const movement = direction * speed;
            const newX = this.lerp(
                currentX,
                currentX + movement,
                this.smoothSpeed
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
