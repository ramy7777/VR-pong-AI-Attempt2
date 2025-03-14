import * as THREE from 'three';

export class FinalScoreDisplay {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.playerScore = 0;
        this.aiScore = 0;
        this.isMultiplayer = false; // Add flag for multiplayer mode
        
        // Create canvas for the final score display
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 512;
        this.context = this.canvas.getContext('2d');
        
        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        
        // Create material with the texture
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide,
            opacity: 0.9
        });
        
        // Create plane geometry for the score display
        this.geometry = new THREE.PlaneGeometry(2, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Position the display above the table
        this.mesh.position.set(0, 1.7, -1.0);
        this.mesh.rotation.set(0, 0, 0);
        
        // Initially hide the display
        this.mesh.visible = false;
        this.scene.add(this.mesh);
        
        // Pre-load the Orbitron font if possible
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap';
        document.head.appendChild(fontLink);
    }
    
    show(playerScore, aiScore, isMultiplayer = false) {
        this.playerScore = playerScore;
        this.aiScore = aiScore;
        this.isMultiplayer = isMultiplayer;
        this.updateDisplay();
        this.mesh.visible = true;
        this.visible = true;
    }
    
    hide() {
        this.mesh.visible = false;
        this.visible = false;
    }
    
    isVisible() {
        return this.visible;
    }
    
    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Create a gradient background
        const bgGradient = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
        bgGradient.addColorStop(0, 'rgba(0, 0, 60, 0.9)');
        bgGradient.addColorStop(1, 'rgba(0, 0, 30, 0.9)');
        
        // Add background with rounded corners
        this.context.fillStyle = bgGradient;
        this.roundRect(this.context, 10, 10, this.canvas.width - 20, this.canvas.height - 20, 30);
        this.context.fill();
        
        // Add border glow
        this.context.strokeStyle = 'rgba(77, 105, 255, 0.7)';
        this.context.lineWidth = 6;
        this.roundRect(this.context, 10, 10, this.canvas.width - 20, this.canvas.height - 20, 30);
        this.context.stroke();
        
        // Use Orbitron font if available, with fallback to sans-serif
        const titleFont = "'Orbitron', sans-serif";
        const scoreFont = "'Orbitron', sans-serif";
        
        // Draw the Game Over text with glow effect
        this.context.fillStyle = '#FF5252';
        this.context.font = `bold 80px ${titleFont}`;
        this.context.textAlign = 'center';
        this.context.textBaseline = 'top';
        this.context.shadowColor = '#FF0000';
        this.context.shadowBlur = 15;
        this.context.shadowOffsetX = 0;
        this.context.shadowOffsetY = 0;
        
        this.context.fillText('GAME OVER', this.canvas.width / 2, 40);
        
        // Add a divider line
        this.context.shadowBlur = 0;
        this.context.beginPath();
        this.context.strokeStyle = 'rgba(77, 105, 255, 0.5)';
        this.context.lineWidth = 2;
        this.context.moveTo(this.canvas.width * 0.1, 140);
        this.context.lineTo(this.canvas.width * 0.9, 140);
        this.context.stroke();
        
        // Set text properties for the final score header
        this.context.fillStyle = '#FFFFFF';
        this.context.font = `bold 50px ${scoreFont}`;
        this.context.shadowColor = '#4444FF';
        this.context.shadowBlur = 10;
        
        // Draw the final score header
        this.context.fillText('FINAL SCORE', this.canvas.width / 2, 160);
        
        // Create score boxes
        const boxWidth = 200;
        const boxHeight = 120;
        const boxSpacing = 40;
        const leftBoxX = this.canvas.width / 2 - boxWidth - boxSpacing / 2;
        const rightBoxX = this.canvas.width / 2 + boxSpacing / 2;
        const boxY = 230;
        
        // Function to create score box
        const drawScoreBox = (x, y, width, height, score, label, isWinner) => {
            // Draw box background
            let bgColor = isWinner ? 'rgba(76, 175, 80, 0.3)' : 'rgba(30, 30, 60, 0.5)';
            let borderColor = isWinner ? 'rgba(76, 175, 80, 0.8)' : 'rgba(255, 255, 255, 0.3)';
            
            this.context.fillStyle = bgColor;
            this.roundRect(this.context, x, y, width, height, 15);
            this.context.fill();
            
            // Draw border
            this.context.strokeStyle = borderColor;
            this.context.lineWidth = 3;
            this.roundRect(this.context, x, y, width, height, 15);
            this.context.stroke();
            
            // Draw label
            this.context.fillStyle = '#FFFFFF';
            this.context.font = `bold 30px ${scoreFont}`;
            this.context.textAlign = 'center';
            this.context.shadowBlur = 0;
            this.context.fillText(label, x + width / 2, y + 30);
            
            // Draw score
            this.context.fillStyle = isWinner ? '#4CAF50' : '#FFFFFF';
            this.context.font = `bold 80px ${scoreFont}`;
            this.context.shadowColor = isWinner ? '#4CAF50' : '#4444FF';
            this.context.shadowBlur = isWinner ? 15 : 5;
            this.context.fillText(score.toString(), x + width / 2, y + 72);
        };
        
        // Determine winner
        const playerWins = this.playerScore > this.aiScore;
        const aiWins = this.aiScore > this.playerScore;
        const isDraw = this.playerScore === this.aiScore;
        
        // Draw player score box
        drawScoreBox(
            leftBoxX, 
            boxY, 
            boxWidth, 
            boxHeight, 
            this.playerScore, 
            this.isMultiplayer ? 'YOU' : 'YOU', 
            playerWins
        );
        
        // Draw AI/opponent score box
        drawScoreBox(
            rightBoxX, 
            boxY, 
            boxWidth, 
            boxHeight, 
            this.aiScore, 
            this.isMultiplayer ? 'OPPONENT' : 'AI', 
            aiWins
        );
        
        // Draw VS text between boxes
        this.context.fillStyle = '#FFFFFF';
        this.context.font = `bold 30px ${scoreFont}`;
        this.context.shadowBlur = 5;
        this.context.fillText('VS', this.canvas.width / 2, boxY + boxHeight / 2);
        
        // Determine result text
        let resultText = 'DRAW';
        let resultColor = '#FFD54F'; // Gold for draw
        
        if (playerWins) {
            resultText = 'YOU WIN!';
            resultColor = '#4CAF50'; // Green for win
        } else if (aiWins) {
            resultText = this.isMultiplayer ? 'OPPONENT WINS' : 'AI WINS';
            resultColor = '#FF5252'; // Red for loss
        }
        
        // Draw result text
        this.context.fillStyle = resultColor;
        this.context.font = `bold 60px ${titleFont}`;
        this.context.shadowColor = resultColor;
        this.context.shadowBlur = 15;
        this.context.fillText(resultText, this.canvas.width / 2, 380);
        
        // Add a note to restart
        this.context.fillStyle = '#FFFFFF';
        this.context.font = `bold 24px ${scoreFont}`;
        this.context.shadowBlur = 0;
        this.context.fillText('PRESS RESTART TO PLAY AGAIN', this.canvas.width / 2, 450);
        
        // Update the texture
        this.texture.needsUpdate = true;
    }
    
    // Helper method to draw rounded rectangles
    roundRect(ctx, x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
        return ctx;
    }
    
    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        this.scene.remove(this.mesh);
    }
} 