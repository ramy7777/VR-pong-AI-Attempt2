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
        this.gameInProgress = false;
        this.gameTimerRunning = false;
        
        // Calculate final match time
        if (this.gameStartTime > 0) {
            this.matchTimeElapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            console.log(`GameAIUpdater: Game ended after ${this.matchTimeElapsed} seconds`);
        }
        
        // Send update to voice assistant if available
        this.sendUpdate('game_ended');
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
                if (scorer === 'player') {
                    this.sendUpdate('player_scored');
                } else if (scorer === 'ai') {
                    this.sendUpdate('ai_scored');
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
                
                // Store the current timer value
                this.gameTimerValue = timeLeft;
                
                // Update timer running state
                this.gameTimerRunning = isRunning && !isFinished;
                
                // Ensure we don't trigger warnings if timer isn't actually running
                if (!this.gameTimerRunning) {
                    return;
                }
                
                // Log timer updates occasionally (once every 5 seconds)
                if (Math.floor(timeLeft) % 5 === 0) {
                    const minutes = Math.floor(timeLeft / 60);
                    const seconds = Math.floor(timeLeft % 60);
                    console.log(`GameAIUpdater: Timer update: ${minutes}:${seconds.toString().padStart(2, '0')} remaining`);
                }
                
                // Only process warnings if the timer is running and game is in progress
                if (this.gameInProgress && isRunning && !isFinished) {
                    this.checkTimerWarnings(timeLeft);
                    
                    // Periodically announce time remaining
                    if (Math.floor(timeLeft) % 30 === 0 && timeLeft > 10) {
                        this.announceTimeRemaining();
                    }
                }
            }
        } catch (error) {
            console.error('GameAIUpdater: Error handling timer update:', error);
        }
    }
    
    /**
     * Check timer thresholds and trigger warnings
     */
    checkTimerWarnings(timeLeft) {
        if (!this.gameInProgress) return;
        
        // Calculate minutes and seconds for display
        const minutes = Math.floor(timeLeft / 60);
        const seconds = Math.floor(timeLeft % 60);
        
        // Check standard thresholds
        for (const threshold of this.timerWarningThresholds) {
            // Check if we've crossed a threshold (going from above to below or equal)
            if (timeLeft <= threshold && 
                (this.lastWarningAt === 0 || 
                 this.lastWarningAt > threshold)) {
                
                console.log(`GameAIUpdater: Timer warning threshold crossed: ${minutes}:${seconds.toString().padStart(2, '0')} remaining`);
                
                this.sendUpdate('timer_warning', { timeLeft, minutes, seconds });
                this.lastWarningAt = timeLeft;
                break;
            }
        }
        
        // Special handling for final 10 seconds - announce each second
        if (timeLeft <= 10 && Math.floor(this.lastWarningAt) !== Math.floor(timeLeft)) {
            console.log(`GameAIUpdater: Timer countdown: ${Math.ceil(timeLeft)} seconds left!`);
            
            // For each second in the final 10, do a countdown announcement
            let countdownMessage = '';
            
            if (Math.ceil(timeLeft) === 10) {
                countdownMessage = "Final 10 seconds countdown starting!";
            } else if (Math.ceil(timeLeft) === 5) {
                countdownMessage = "Just 5 seconds left!";
            } else if (Math.ceil(timeLeft) === 3) {
                countdownMessage = "3...";
            } else if (Math.ceil(timeLeft) === 2) {
                countdownMessage = "2...";
            } else if (Math.ceil(timeLeft) === 1) {
                countdownMessage = "1...";
            } else if (Math.floor(timeLeft) < 0.5) {
                countdownMessage = "Time's up!";
            } else {
                countdownMessage = `${Math.ceil(timeLeft)}...`;
            }
            
            this.sendUpdate('timer_countdown', { 
                timeLeft, 
                minutes, 
                seconds,
                message: countdownMessage 
            });
            
            this.lastWarningAt = timeLeft;
        }
    }
    
    /**
     * Announce current time remaining
     */
    announceTimeRemaining() {
        if (!this.gameInProgress || !this.gameTimerRunning) return;
        
        const timeLeft = this.gameTimerValue;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = Math.floor(timeLeft % 60);
        
        let timeMessage = '';
        
        // Format the time message based on how much time is left
        if (minutes > 0) {
            timeMessage = `${minutes} minute${minutes > 1 ? 's' : ''} and ${seconds} seconds remaining.`;
        } else if (seconds > 30) {
            timeMessage = `${seconds} seconds remaining.`;
        } else if (seconds > 10) {
            timeMessage = `Only ${seconds} seconds left!`;
        } else {
            timeMessage = `Final countdown! ${seconds} seconds!`;
        }
        
        this.sendUpdate('time_announcement', { 
            timeLeft, 
            minutes, 
            seconds, 
            message: timeMessage 
        });
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
            
            // If this is a special message type, handle accordingly
            if (eventType === 'gameplay_tip' || eventType === 'time_announcement') {
                // These are sent as system messages with the message field
                const message = updatedData.message || 'Game update';
                this.voiceAssistant.sendSystemMessage(message);
                console.log(`GameAIUpdater: Sent ${eventType} to voice assistant: "${message}"`);
                return;
            }
            
            // Use the voice assistant's sendGameStateUpdate method for other updates
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