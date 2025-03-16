/**
 * GameAIUpdater.js
 * 
 * This module handles all game state updates to the OpenAI voice assistant.
 * It provides a clean interface for sending different types of game events
 * to the AI assistant without cluttering the main game code.
 */

export class GameAIUpdater {
    constructor() {
        // Reference to the OpenAI voice assistant
        this.voiceAssistant = null;
        
        // Game state tracking
        this.gameInProgress = false;
        this.playerScore = 0;
        this.aiScore = 0;
        this.gameStartTime = 0;
        this.gameTimerValue = 150; // Default 2.5 minutes (150 seconds)
        this.gameTimerRunning = false;
        this.lastWarningAt = 0;
        this.timerWarningThresholds = [60, 30, 20, 10]; // Seconds left thresholds for warnings
        
        // Rally tracking
        this.rallyStartTime = 0;
        this.currentRallyDuration = 0;
        this.lastRallyDuration = 0;
        
        // Other game state
        this.aiSlowdownActive = false;
        
        // Bind event listeners
        this.bindEvents();
    }
    
    /**
     * Initialize the updater with a reference to the voice assistant
     */
    initialize(voiceAssistant) {
        if (!voiceAssistant) {
            console.warn('GameAIUpdater: No voice assistant provided');
            return;
        }
        
        this.voiceAssistant = voiceAssistant;
        console.log('GameAIUpdater: Initialized with voice assistant');
    }
    
    /**
     * Bind DOM event listeners for game events
     */
    bindEvents() {
        // Listen for game events
        document.addEventListener('game-started', this.handleGameStarted.bind(this));
        document.addEventListener('game-ended', this.handleGameEnded.bind(this));
        document.addEventListener('score-update', this.handleScoreUpdate.bind(this));
        document.addEventListener('collision-event', this.handleCollision.bind(this));
        document.addEventListener('timer-update', this.handleTimerUpdate.bind(this));
        document.addEventListener('ai-slowdown-started', this.handleAISlowdownStart.bind(this));
        document.addEventListener('ai-slowdown-ended', this.handleAISlowdownEnd.bind(this));
        
        // Add interval to update game time
        setInterval(() => {
            if (this.gameInProgress && this.gameStartTime > 0) {
                this.currentGameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
                
                // Update rally duration if a rally is in progress
                if (this.rallyStartTime > 0) {
                    this.currentRallyDuration = Math.floor((Date.now() - this.rallyStartTime) / 1000);
                }
            }
        }, 1000);
        
        console.log('GameAIUpdater: Event listeners bound');
    }
    
    /**
     * Handle game-started event
     */
    handleGameStarted(event) {
        console.log('GameAIUpdater: Game started event received');
        this.gameInProgress = true;
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Track game timing
        this.gameStartTime = Date.now();
        this.rallyStartTime = this.gameStartTime;
        this.currentGameTime = 0;
        
        // Initialize timer state
        this.gameTimerValue = 150; // Default 2.5 minutes
        
        // Track game timer with improved initialization
        if (event.detail) {
            // Use timer values from the event if available
            if (event.detail.timerDuration !== undefined) {
                this.gameTimerValue = event.detail.timerDuration;
                console.log(`GameAIUpdater: Timer initialized from timerDuration: ${this.gameTimerValue} seconds`);
            } else if (event.detail.timeLeft !== undefined) {
                this.gameTimerValue = event.detail.timeLeft;
                console.log(`GameAIUpdater: Timer initialized from timeLeft: ${this.gameTimerValue} seconds`);
            } else {
                console.log(`GameAIUpdater: Timer initialized with default: ${this.gameTimerValue} seconds`);
            }
        } else {
            console.log(`GameAIUpdater: Timer initialized with default: ${this.gameTimerValue} seconds (no event details)`);
        }
        
        // Mark timer as running and reset warnings
        this.gameTimerRunning = true;
        this.lastWarningAt = this.gameTimerValue + 1; // Start above all thresholds
        
        // Send update to voice assistant if available
        this.sendUpdate('game_started');
    }
    
    /**
     * Handle game-ended event
     */
    handleGameEnded(event) {
        console.log('GameAIUpdater: Game ended event received');
        
        // Calculate final match time before changing game state
        let matchTimeElapsed = 0;
        if (this.gameStartTime > 0) {
            matchTimeElapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            console.log(`GameAIUpdater: Game ended after ${matchTimeElapsed} seconds`);
        }
        
        // Update state variables
        this.gameInProgress = false;
        this.gameTimerRunning = false;
        
        // Ensure there's a slight delay before sending the game_ended event
        // This prevents any race conditions with other updates
        setTimeout(() => {
            // Send update to voice assistant if available
            this.sendUpdate('game_ended', {
                matchTimeElapsed,
                gameInProgress: false, // Explicitly mark as not in progress
                finalScore: {
                    player: this.playerScore,
                    ai: this.aiScore
                }
            });
            
            // Stop any active timers
            this.stopTipsTimer();
        }, 1000); // Wait 1 second before sending game_ended message
    }
    
    /**
     * Handle score-update event
     */
    handleScoreUpdate(event) {
        try {
            if (event.detail) {
                const { playerScore, aiScore, scorer } = event.detail;
                
                // Update stored scores
                this.playerScore = playerScore;
                this.aiScore = aiScore;
                
                // Calculate rally duration
                if (this.rallyStartTime > 0) {
                    this.lastRallyDuration = Math.floor((Date.now() - this.rallyStartTime) / 1000);
                    console.log(`GameAIUpdater: Rally lasted ${this.lastRallyDuration} seconds`);
                }
                
                // Start a new rally timer
                this.rallyStartTime = Date.now();
                this.currentRallyDuration = 0;
                
                console.log(`GameAIUpdater: Score updated: Player ${playerScore} - AI ${aiScore}, Scorer: ${scorer}`);
                
                // Send update based on who scored
                const updateData = {
                    lastRallyDuration: this.lastRallyDuration,
                    gameInProgress: this.gameInProgress
                };
                
                if (scorer === 'player') {
                    this.sendUpdate('player_scored', updateData);
                } else if (scorer === 'ai') {
                    this.sendUpdate('ai_scored', updateData);
                }
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling score update:', error);
        }
    }
    
    /**
     * Handle collision events
     */
    handleCollision(event) {
        try {
            if (event.detail) {
                const { type, velocity } = event.detail;
                
                // Update current rally duration
                if (this.rallyStartTime > 0) {
                    this.currentRallyDuration = Math.floor((Date.now() - this.rallyStartTime) / 1000);
                }
                
                // Only send updates for certain collision types to avoid spam
                if (this.gameInProgress) {
                    if (type === 'paddle' && Math.random() < 0.3) {
                        this.sendUpdate('paddle_hit');
                    } else if (type === 'wall' && Math.random() < 0.1) {
                        this.sendUpdate('wall_hit');
                    }
                }
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling collision event:', error);
        }
    }
    
    /**
     * Handle timer updates
     */
    handleTimerUpdate(event) {
        try {
            if (event.detail && event.detail.timeLeft !== undefined) {
                const timeLeft = event.detail.timeLeft;
                const isRunning = event.detail.isRunning !== undefined ? event.detail.isRunning : true;
                const totalDuration = event.detail.totalDuration || 150;
                const isFinished = event.detail.isFinished || false;
                
                // Store the current timer value but don't announce it
                this.gameTimerValue = timeLeft;
                this.gameTimerRunning = isRunning && !isFinished;
                
                // Log timer updates only for debugging purposes
                const currentMinutes = Math.floor(timeLeft / 60);
                const currentSeconds = Math.floor(timeLeft % 60);
                
                console.log(`GameAIUpdater: Timer update: ${currentMinutes}:${currentSeconds.toString().padStart(2, '0')} remaining (timer announcements disabled)`);
                
                // Store last logged value for internal tracking only
                this.lastLoggedTimerValue = timeLeft;
                
                // No timer announcements will be sent - timer awareness disabled
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling timer update:', error);
        }
    }
    
    /**
     * Check timer thresholds and trigger warnings for final countdown
     * This method is now empty as timer awareness is disabled
     */
    checkTimerWarnings(timeLeft) {
        // Timer announcements disabled - no countdown warnings will be sent
        return;
    }
    
    /**
     * Announce current time remaining
     * This method is now empty as timer awareness is disabled  
     */
    announceTimeRemaining() {
        // Timer announcements disabled - no time remaining announcements will be sent
        return;
    }
    
    /**
     * Handle AI slowdown start event
     */
    handleAISlowdownStart(event) {
        try {
            console.log('GameAIUpdater: AI slowdown started');
            this.aiSlowdownActive = true;
            
            if (this.gameInProgress) {
                this.sendUpdate('ai_slowdown');
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling AI slowdown start event:', error);
        }
    }
    
    /**
     * Handle AI slowdown end event
     */
    handleAISlowdownEnd() {
        try {
            console.log('GameAIUpdater: AI slowdown ended');
            this.aiSlowdownActive = false;
            
            if (this.gameInProgress) {
                this.sendUpdate('ai_speed_restored');
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling AI slowdown end event:', error);
        }
    }
    
    /**
     * Send gameplay tips periodically
     */
    sendGameplayTip() {
        if (!this.gameInProgress) return;
        
        const playerScore = this.playerScore;
        const aiScore = this.aiScore;
        const playerLeading = playerScore > aiScore;
        const aiLeading = aiScore > playerScore;
        const scoreDifference = Math.abs(playerScore - aiScore);
        
        let tipMessage = '';
        
        // Different tips based on game state
        if (aiLeading) {
            // Tips for when player is behind
            const comebackTips = [
                "Try angling your shots",
                "Aim for the corners",
                "Vary your serve speed",
                "Watch your paddle angle",
                "Stay centered more",
                "Mix up your strategy",
                "Observe AI patterns",
                "Quick wrist flicks help",
                "Anticipate return angles"
            ];
            tipMessage = comebackTips[Math.floor(Math.random() * comebackTips.length)];
        } else if (playerLeading) {
            // Tips for when player is ahead
            const maintainLeadTips = [
                "Keep up the good work",
                "Stay focused",
                "Don't get overconfident",
                "Maintain your rhythm",
                "Keep your positioning",
                "Your technique is working",
                "Stay with your strategy"
            ];
            tipMessage = maintainLeadTips[Math.floor(Math.random() * maintainLeadTips.length)];
        } else {
            // General tips for tie game
            const generalTips = [
                "Control paddle angle carefully",
                "Stay balanced and ready",
                "Watch ball trajectory",
                "Conserve energy between points",
                "Try unexpected angles",
                "Patience wins points",
                "Position before power"
            ];
            tipMessage = generalTips[Math.floor(Math.random() * generalTips.length)];
        }
        
        // Send the tip
        this.sendUpdate('gameplay_tip', { 
            message: tipMessage,
            playerScore,
            aiScore,
            playerLeading,
            aiLeading,
            scoreDifference
        });
    }
    
    /**
     * Send a game state update to the voice assistant
     */
    sendUpdate(eventType, extraData = {}) {
        if (!this.voiceAssistant) {
            // No voice assistant connected, just log
            console.log(`GameAIUpdater: Would send ${eventType} update, but no voice assistant connected`);
            return;
        }
        
        try {
            // Check if voice assistant is connected
            if (!this.voiceAssistant.connected) {
                console.log(`GameAIUpdater: Voice assistant not connected, skipping ${eventType} update`);
                return;
            }
            
            // Add game state to extraData
            const updatedData = {
                ...extraData,
                gameInProgress: this.gameInProgress,
                playerScore: this.playerScore,
                aiScore: this.aiScore,
                gameTimerValue: this.gameTimerValue,
                gameTimerRunning: this.gameTimerRunning,
                currentRallyDuration: this.currentRallyDuration,
                lastRallyDuration: this.lastRallyDuration,
                aiSlowdownActive: this.aiSlowdownActive
            };
            
            // Use the voice assistant's sendGameStateUpdate method for all updates
            if (typeof this.voiceAssistant.sendGameStateUpdate === 'function') {
                this.voiceAssistant.sendGameStateUpdate(eventType, updatedData);
                console.log(`GameAIUpdater: Sent ${eventType} update to voice assistant`);
            } else {
                console.warn(`GameAIUpdater: Voice assistant doesn't have sendGameStateUpdate method`);
            }
        } catch (error) {
            console.error(`GameAIUpdater: Error sending ${eventType} update:`, error);
        }
    }
    
    /**
     * Start sending periodic gameplay tips
     */
    startTipsTimer() {
        // Clear any existing timer
        this.stopTipsTimer();
        
        // Send gameplay tips every 30-60 seconds
        this.tipsTimer = setInterval(() => {
            if (!this.gameInProgress) {
                this.stopTipsTimer();
                return;
            }
            
            // Only send tips if the game has been going for a while
            const gameTime = Date.now() - this.gameStartTime;
            if (gameTime < 15000) { // Don't send tips in the first 15 seconds
                return;
            }
            
            // Check if we should send a tip based on game state
            const scoreDifference = Math.abs(this.playerScore - this.aiScore);
            const playerLeading = this.playerScore > this.aiScore;
            const aiLeading = this.aiScore > this.playerScore;
            
            // Higher chance of tips when player is behind
            let shouldSendTip = Math.random() < 0.7; // 70% chance normally
            
            if (aiLeading && scoreDifference >= 3) {
                shouldSendTip = Math.random() < 0.9; // 90% chance when player is far behind
            } else if (playerLeading && scoreDifference >= 3) {
                shouldSendTip = Math.random() < 0.5; // 50% chance when player is far ahead
            }
            
            if (shouldSendTip) {
                this.sendGameplayTip();
            }
            
        }, 30000); // Check every 30 seconds
        
        console.log('GameAIUpdater: Started tips timer');
    }
    
    /**
     * Stop the gameplay tips timer
     */
    stopTipsTimer() {
        if (this.tipsTimer) {
            clearInterval(this.tipsTimer);
            this.tipsTimer = null;
            console.log('GameAIUpdater: Stopped tips timer');
        }
    }
}

// Create a singleton instance
const gameAIUpdater = new GameAIUpdater();

// Export the singleton instance
export default gameAIUpdater; 