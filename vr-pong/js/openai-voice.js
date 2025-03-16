/**
 * OpenAI WebRTC Voice Integration for VR Pong
 * This module handles the real-time voice communication with OpenAI's GPT-4o
 * Using native WebRTC implementation with server proxy for key management
 */

// Import the GameAIUpdater singleton
import gameAIUpdater from './ai/GameAIUpdater.js';

class OpenAIVoiceAssistant {
    constructor(socket = null) {
        console.log(`OpenAIVoiceAssistant initialized ${socket ? 'with' : 'without'} a socket - broadcasting ${socket ? 'enabled' : 'disabled'}`);
        
        // Store socket reference
        this.socket = socket;
        
        // Element references - get them right away to ensure they're available
        this.connectButton = document.getElementById('connectOpenAI');
        this.voiceStatus = document.getElementById('voiceStatus');
        this.transcriptElement = document.getElementById('openaiTranscript');
        
        // Log element initialization results
        console.log('UI elements initialized:',
            'connectButton =', this.connectButton ? 'found' : 'not found',
            'voiceStatus =', this.voiceStatus ? 'found' : 'not found',
            'transcriptElement =', this.transcriptElement ? 'found' : 'not found'
        );
        
        // Setup state
        this.connected = false;
        this.isProcessing = false;
        this.apiKey = null;
        this.remoteAudioElement = null;
        
        // WebRTC properties
        this.peerConnection = null;
        this.dataChannel = null;
        this.iceCandidates = [];
        this.audioContext = null;
        this.audioStream = null;
        this.microphoneStream = null;
        
        // Audio broadcasting properties
        this.broadcastingEnabled = socket ? true : false;
        this.broadcastingRoomId = null;
        this.mediaRecorder = null;
        this.lastBroadcastTime = 0;
        this.receivingRemoteAudio = false;
        
        // Game state tracking
        this.gameInProgress = false;
        this.playerScore = 0;
        this.aiScore = 0;
        this.gameTimerValue = 150; // Default 2.5 minutes (150 seconds)
        this.gameTimerRunning = false;
        this.lastMessageTime = 0; // For throttling messages
        
        // Message handling
        this.messageQueue = [];
        this.processingQueue = false;
        this.heartbeatInterval = null;
        
        // Bind UI elements and set up event handlers
        this.bindEvents();
        
        // Create audio elements
        this.createRemoteAudioElement();
        
        // Set up audio receiver if socket is provided
        if (this.socket) {
            this.setupAIAudioReceiver();
        }
        
        // Initialize the GameAIUpdater with a reference to this class
        gameAIUpdater.initialize(this);
    }
    
    bindEvents() {
        // Try to get UI elements if they weren't found during initialization
        if (!this.connectButton) {
            this.connectButton = document.getElementById('connectOpenAI');
            console.log('Trying to find connect button again:', this.connectButton ? 'found' : 'still not found');
        }
        
        if (!this.voiceStatus) {
            this.voiceStatus = document.getElementById('voiceStatus');
            console.log('Trying to find voice status again:', this.voiceStatus ? 'found' : 'still not found');
        }
        
        if (!this.transcriptElement) {
            this.transcriptElement = document.getElementById('openaiTranscript');
            console.log('Trying to find transcript element again:', this.transcriptElement ? 'found' : 'still not found');
        }
        
        // Attach click handler if we have the button
        if (this.connectButton) {
            // Remove any existing handlers to prevent duplicates
            this.connectButton.removeEventListener('click', this._boundToggleConnection);
            
            // Create bound method and store reference for later removal
            this._boundToggleConnection = this.toggleConnection.bind(this);
            
            // Add the event listener
            this.connectButton.addEventListener('click', this._boundToggleConnection);
            console.log('Click handler attached to connect button');
        } else {
            console.error('Connect button not found in the DOM, click handler not attached');
        }
        
        // Note: We're no longer attaching game event listeners here
        // Game event listeners are now handled by GameAIUpdater
        
        // But we need to sync game state for backward compatibility
        document.addEventListener('game-started', (event) => {
            this.gameInProgress = true;
            this.playerScore = 0;
            this.aiScore = 0;
        });
        
        document.addEventListener('game-ended', () => {
            this.gameInProgress = false;
        });
        
        document.addEventListener('score-update', (event) => {
            if (event.detail) {
                const { playerScore, aiScore } = event.detail;
                this.playerScore = playerScore;
                this.aiScore = aiScore;
            }
        });
        
        // Listen for connection changes to update the UI
        // ... existing code ...
        
        // Add event listeners for game events
        document.addEventListener('game-started', (event) => {
            console.log('Game started, OpenAI voice assistant is ' + (this.connected ? 'active' : 'inactive'));
            this.gameInProgress = true;
            this.playerScore = 0;
            this.aiScore = 0;
            
            // Track game timing
            this.gameStartTime = Date.now();
            this.rallyStartTime = this.gameStartTime;
            this.currentGameTime = 0;
            this.matchTimeElapsed = 0;
            
            // Initialize timer state properly
            this.gameTimerValue = 150; // Default 2.5 minutes (150 seconds)
            
            // Track game timer with improved initialization
            if (event.detail) {
                // Use timer values from the event if available
                if (event.detail.timerDuration !== undefined) {
                    this.gameTimerValue = event.detail.timerDuration;
                    console.log(`Game timer initialized from timerDuration: ${this.gameTimerValue} seconds`);
                } else if (event.detail.timeLeft !== undefined) {
                    // Update with current time left if provided
                    this.gameTimerValue = event.detail.timeLeft;
                    console.log(`Game timer initialized from timeLeft: ${this.gameTimerValue} seconds`);
                } else {
                    console.log(`Game timer initialized with default: ${this.gameTimerValue} seconds`);
                }
            } else {
                console.log(`Game timer initialized with default: ${this.gameTimerValue} seconds (no event details)`);
            }
            
            // Mark timer as running and reset warnings
            this.gameTimerRunning = true;
            this.gameTimerLastWarningAt = this.gameTimerValue + 1; // Start above all thresholds
            
            // If connected, send a game start notification
            if (this.connected) {
                this.sendGameStateUpdate('game_started');
                
                // Start gameplay tips timer
                this.startGameplayTipsTimer();
            }
        });
        
        document.addEventListener('game-ended', (event) => {
            console.log('Game ended');
            this.gameInProgress = false;
            this.gameTimerRunning = false;
            
            // Calculate final match time
            if (this.gameStartTime > 0) {
                this.matchTimeElapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
                console.log(`Game ended after ${this.matchTimeElapsed} seconds`);
            }
            
            // Stop gameplay tips timer
            this.stopGameplayTipsTimer();
            
            // If connected, send a game end notification with final score
            if (this.connected) {
                this.sendGameStateUpdate('game_ended');
            }
        });
        
        // Listen for score updates
        document.addEventListener('score-update', (event) => {
            try {
                if (event.detail) {
                    const { playerScore, aiScore, scorer } = event.detail;
                    
                    // Update stored scores
                    this.playerScore = playerScore;
                    this.aiScore = aiScore;
                    
                    // Calculate rally duration
                    if (this.rallyStartTime > 0) {
                        this.lastRallyDuration = Math.floor((Date.now() - this.rallyStartTime) / 1000);
                        console.log(`Rally lasted ${this.lastRallyDuration} seconds`);
                    }
                    
                    // Start a new rally timer
                    this.rallyStartTime = Date.now();
                    this.currentRallyDuration = 0;
                    
                    console.log(`Score updated: Player ${playerScore} - AI ${aiScore}, Scorer: ${scorer}`);
                    
                    // Handle different scoring scenarios
                    if (scorer === 'player') {
                        // Player scored
                        console.log('Player scored!');
                        
                        // If connected, send a player score notification
                        if (this.connected) {
                            this.sendGameStateUpdate('player_scored');
                        }
                    } else if (scorer === 'ai') {
                        // AI scored
                        console.log('AI scored!');
                        
                        // If connected, send an AI score notification
                        if (this.connected) {
                            this.sendGameStateUpdate('ai_scored');
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling score update:', error);
            }
        });

        // Listen for collision events
        document.addEventListener('collision-event', (event) => {
            try {
                if (event.detail) {
                    const { type, velocity } = event.detail;
                    
                    // Store the last collision type and time
                    this.lastCollisionType = type;
                    this.lastCollisionTime = Date.now();
                    
                    // Update current rally duration
                    if (this.rallyStartTime > 0) {
                        this.currentRallyDuration = Math.floor((Date.now() - this.rallyStartTime) / 1000);
                    }
                    
                    // If connected, potentially send a collision update
                    if (this.connected && this.gameInProgress) {
                        // Only send for significant events to avoid spam
                        if (type === 'paddle' && Math.random() < 0.3) {
                            this.sendGameStateUpdate('paddle_hit');
                        } else if (type === 'wall' && Math.random() < 0.1) {
                            this.sendGameStateUpdate('wall_hit');
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling collision event:', error);
            }
        });
        
        // Listen for timer updates
        document.addEventListener('timer-update', (event) => {
            try {
                if (event.detail && event.detail.timeLeft !== undefined) {
                    const timeLeft = event.detail.timeLeft;
                    const isRunning = event.detail.isRunning !== undefined ? event.detail.isRunning : true;
                    const totalDuration = event.detail.totalDuration || 150;
                    const isFinished = event.detail.isFinished || false;
                    
                    // Store the current timer value
                    this.gameTimerValue = timeLeft;
                    
                    // Update timer running state based on explicit information from the game
                    this.gameTimerRunning = isRunning && !isFinished;
                    
                    // Ensure we don't trigger warnings if timer isn't actually running
                    if (!this.gameTimerRunning) {
                        return;
                    }
                    
                    // Log timer updates only on significant changes to reduce spam
                    const previousMinutes = Math.floor((this.lastLoggedTimerValue || 0) / 60);
                    const previousSeconds = Math.floor((this.lastLoggedTimerValue || 0) % 60);
                    const currentMinutes = Math.floor(timeLeft / 60);
                    const currentSeconds = Math.floor(timeLeft % 60);
                    
                    // Only log when minutes change or seconds change by 15
                    const shouldLog = 
                        previousMinutes !== currentMinutes || 
                        Math.floor(previousSeconds / 15) !== Math.floor(currentSeconds / 15);
                    
                    if (shouldLog) {
                        console.log(`Timer update: ${currentMinutes}:${currentSeconds.toString().padStart(2, '0')} remaining, running=${isRunning}, finished=${isFinished}`);
                        this.lastLoggedTimerValue = timeLeft;
                    }
                    
                    // Only process warnings if the timer is actually running and the game is in progress
                    if (this.gameInProgress && isRunning && !isFinished) {
                        // Check if we should announce time remaining
                        this.checkTimerWarnings(timeLeft);
                    }
                }
            } catch (error) {
                console.error('Error handling timer update:', error);
            }
        });
        
        // Listen for AI slowdown events
        document.addEventListener('ai-slowdown-started', (event) => {
            try {
                console.log('AI slowdown started');
                this.aiSlowdownActive = true;
                this.aiSlowdownStartTime = Date.now();
                this.aiSlowdownDuration = event.detail ? event.detail.duration : 1500; // Default 1.5 seconds
                
                // If connected, send an AI slowdown notification
                if (this.connected && this.gameInProgress) {
                    this.sendGameStateUpdate('ai_slowdown');
                }
            } catch (error) {
                console.error('Error handling AI slowdown start event:', error);
            }
        });
        
        document.addEventListener('ai-slowdown-ended', () => {
            try {
                console.log('AI slowdown ended');
                this.aiSlowdownActive = false;
                
                // If connected, send an AI speed restored notification
                if (this.connected && this.gameInProgress) {
                    this.sendGameStateUpdate('ai_speed_restored');
                }
            } catch (error) {
                console.error('Error handling AI slowdown end event:', error);
            }
        });
        
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
        
        // Add event listeners for menu button clicks
        document.addEventListener('menu-button-click', (event) => {
            try {
                if (event.detail && event.detail.button) {
                    const buttonName = event.detail.button;
                    console.log(`Menu button clicked: ${buttonName}`);
                    
                    // If connected, send menu navigation update
                    if (this.connected) {
                        this.sendMenuNavigationUpdate(buttonName);
                    }
                }
            } catch (error) {
                console.error('Error handling menu button click:', error);
            }
        });
    }
    
    /**
     * Check if the current time left crosses any warning thresholds
     */
    checkTimerWarnings(timeLeft) {
        if (!this.connected || !this.gameInProgress) return;
        
        // Calculate minutes and seconds for display
        const minutes = Math.floor(timeLeft / 60);
        const seconds = Math.floor(timeLeft % 60);
        
        // Skip if time is negative
        if (timeLeft <= 0) return;
        
        // Ensure timerWarningThresholds is iterable
        if (!this.timerWarningThresholds || !Array.isArray(this.timerWarningThresholds)) {
            this.timerWarningThresholds = [60, 30, 20, 10]; // Default thresholds
            console.log('Timer warning thresholds initialized with defaults');
        }
        
        // Check standard thresholds
        for (const threshold of this.timerWarningThresholds) {
            // Check if we've crossed a threshold (going from above to below or equal)
            if (timeLeft <= threshold && 
                (this.gameTimerLastWarningAt === 0 || 
                 this.gameTimerLastWarningAt > threshold)) {
                
                console.log(`Timer warning threshold crossed: ${minutes}:${seconds.toString().padStart(2, '0')} remaining`);
                
                if (this.connected) {
                    this.sendGameStateUpdate('timer_warning', { timeLeft, minutes, seconds });
                }
                this.gameTimerLastWarningAt = timeLeft;
                break;
            }
        }
        
        // Special handling for final 10 seconds - announce each second
        if (timeLeft <= 10 && Math.floor(this.gameTimerLastWarningAt) !== Math.floor(timeLeft)) {
            console.log(`Timer countdown: ${Math.ceil(timeLeft)} seconds left!`);
            
            if (this.connected) {
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
                
                this.sendGameStateUpdate('timer_countdown', { 
                    timeLeft, 
                    minutes, 
                    seconds,
                    message: countdownMessage 
                });
            }
            this.gameTimerLastWarningAt = timeLeft;
        }
    }
    
    createRemoteAudioElement() {
        // Check if the element already exists
        let existingElement = document.getElementById('remote-ai-audio');
        if (existingElement) {
            console.log('Remote audio element already exists');
            this.remoteAudioElement = existingElement;
            return;
        }
        
        console.log('Creating remote audio element for AI audio from other players');
        
        // Create the audio element
        this.remoteAudioElement = document.createElement('audio');
        this.remoteAudioElement.id = 'remote-ai-audio';
        
        // Configure for best autoplay behavior
        this.remoteAudioElement.autoplay = true;
        this.remoteAudioElement.setAttribute('playsinline', '');
        this.remoteAudioElement.setAttribute('webkit-playsinline', '');  // For Safari
        this.remoteAudioElement.crossOrigin = 'anonymous';
        this.remoteAudioElement.preload = 'auto';
        this.remoteAudioElement.volume = 1.0;
        
        // Add to document
        document.body.appendChild(this.remoteAudioElement);
        
        // Set up event listeners for debugging
        this.remoteAudioElement.addEventListener('play', () => {
            console.log('Remote audio element play event triggered');
        });
        
        this.remoteAudioElement.addEventListener('playing', () => {
            console.log('Remote audio element is now playing');
        });
        
        this.remoteAudioElement.addEventListener('pause', () => {
            console.log('Remote audio element paused');
        });
        
        this.remoteAudioElement.addEventListener('ended', () => {
            console.log('Remote audio element playback ended');
        });
        
        this.remoteAudioElement.addEventListener('error', (e) => {
            console.error('Remote audio element error:', e);
        });
        
        console.log('Remote audio element created and configured');
    }
    
    // Set up broadcasting for AI audio
    setupAudioBroadcasting() {
        if (!this.socket) {
            console.log('Cannot set up AI audio broadcasting: No socket available');
            this.isBroadcasting = false;
            return;
        }
        
        console.log('Setting up AI audio broadcasting with socket ID:', this.socket.id);
        this.isBroadcasting = true;
        
        // Check if the socket is connected
        if (!this.socket.connected) {
            console.warn('Socket is not connected, broadcasting may not work');
        }
        
        // Test the socket connection with a small ping
        this.socket.emit('ping', {}, (response) => {
            if (response && response.status === 'ok') {
                console.log('Socket connection confirmed working for broadcasting');
            } else {
                console.warn('Socket ping test failed, broadcasting may not work');
            }
        });
    }
    
    // Handle incoming AI audio from other players
    setupAIAudioReceiver() {
        if (!this.socket) {
            console.log('No socket connection, skipping AI audio receiver setup');
            return;
        }
        
        console.log('Setting up AI audio receiver for broadcasts from other players');
        
        // Create remote audio element if it doesn't exist yet
        if (!this.remoteAudioElement) {
            this.createRemoteAudioElement();
        }
        
        // Listen for AI audio broadcasts from other players
        this.socket.on('ai-audio-broadcast', (data) => {
            try {
                console.log(`Received AI audio from ${data.from}, size: ${data.audioData ? data.audioData.length : 0} bytes`);
                
                // Skip processing if we're the sender or if no audio data
                if (data.from === this.socket.id || !data.audioData) {
                    console.log('Skipping broadcast from self or empty data');
                    return;
                }
                
                // Handle the incoming audio data
                this.handleIncomingAudioData(data.audioData);
            } catch (error) {
                console.error('Error handling AI audio broadcast:', error);
            }
        });
        
        // Legacy handler for older ai-audio-response format
        this.socket.on('ai-audio-response', (data) => {
            try {
                console.log(`Received legacy AI audio response from ${data.from}, size: ${data.audioData?.content?.length || 0} bytes`);
                
                // Skip processing if we're the sender or if no audio data
                if (data.from === this.socket.id || !data.audioData?.content) {
                    return;
                }
                
                // Handle the incoming audio data (extract from legacy format)
                this.handleIncomingAudioData(data.audioData.content);
            } catch (error) {
                console.error('Error handling legacy AI audio response:', error);
            }
        });
    }
    
    handleIncomingAudioData(audioData) {
        // Temporarily disable our own broadcasting to avoid conflicts
        const wasBroadcasting = this.broadcastingEnabled;
        this.broadcastingEnabled = false;
        
        try {
            // Convert base64 audio data to blob
            const blob = this.base64toBlob(audioData, 'audio/webm;codecs=opus');
            const audioUrl = URL.createObjectURL(blob);
            
            console.log(`Converting received audio (${blob.size} bytes) to URL: ${audioUrl}`);
            
            // Play the audio using our remote audio element
            if (this.remoteAudioElement) {
                this.remoteAudioElement.src = audioUrl;
                this.remoteAudioElement.oncanplaythrough = () => {
                    console.log('Remote AI audio ready to play');
                    
                    // Play the audio
                    const playPromise = this.remoteAudioElement.play();
                    
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            console.log('Remote AI audio playback started');
                        }).catch(error => {
                            console.error('Remote AI audio playback failed:', error);
                            
                            // If autoplay was prevented, try again after user interaction
                            console.log('Adding click listener for remote audio playback');
                            document.addEventListener('click', function playOnClick() {
                                console.log('User clicked, trying remote audio playback again');
                                this.remoteAudioElement.play().catch(e => 
                                    console.error('Remote audio playback failed again:', e)
                                );
                                document.removeEventListener('click', playOnClick);
                            }.bind(this), { once: true });
                        });
                    }
                };
                
                this.remoteAudioElement.onerror = (error) => {
                    console.error('Error playing remote AI audio:', error);
                    // Re-enable broadcasting after error
                    this.broadcastingEnabled = wasBroadcasting;
                };
                
                this.remoteAudioElement.onended = () => {
                    console.log('Remote AI audio playback completed');
                    // Clean up the URL and re-enable broadcasting
                    URL.revokeObjectURL(audioUrl);
                    this.broadcastingEnabled = wasBroadcasting;
                };
            } else {
                console.error('Remote audio element not found');
                this.broadcastingEnabled = wasBroadcasting;
            }
        } catch (error) {
            console.error('Error processing incoming audio data:', error);
            this.broadcastingEnabled = wasBroadcasting;
        }
    }
    
    // Helper method to convert base64 to blob with improved handling
    base64toBlob(base64Data, contentType) {
        try {
            // Check for valid base64 data
            if (!base64Data || typeof base64Data !== 'string') {
                console.error('Invalid base64 data received');
                return new Blob([], { type: contentType });
            }
            
            // Decode the base64 string
            const byteCharacters = atob(base64Data);
            const byteArrays = [];
            
            // Create byte arrays in small chunks for better memory handling
            const chunkSize = 512;
            for (let offset = 0; offset < byteCharacters.length; offset += chunkSize) {
                const slice = byteCharacters.slice(offset, offset + chunkSize);
                
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }
            
            // Create and return the blob
            return new Blob(byteArrays, { type: contentType });
        } catch (error) {
            console.error('Error converting base64 to blob:', error);
            // Return an empty blob on error
            return new Blob([], { type: contentType });
        }
    }
    
    async toggleConnection() {
        console.log('Toggle connection called, current state:', this.connected);
        
        if (!this.connected) {
            await this.connect();
        } else {
            await this.disconnect();
        }
    }
    
    async connect() {
        try {
            // Double-check that UI elements exist
            if (!this.voiceStatus) {
                console.error('Voice status element not found, cannot update status');
                this.voiceStatus = document.getElementById('voiceStatus');
            }
            
            // Update status
            this.updateStatus('Connecting...');
            
            // Request API key from user only if we don't have one
            if (!this.apiKey) {
                console.log('Prompting for OpenAI API key...');
                const apiKeyInput = window.prompt('Please enter your OpenAI API Key:', '');
                console.log('API key prompt result:', apiKeyInput ? 'API key provided' : 'API key prompt cancelled');
                
                if (!apiKeyInput) {
                    this.updateStatus('Connection cancelled');
                    return;
                }
                
                this.apiKey = apiKeyInput.trim();
            } else {
                console.log('Reusing existing API key');
            }
            
            // Initialize audio first
            console.log('Setting up audio before connecting...');
            await this.initializeAudio();
            
            // Establish WebRTC connection
            await this.setupWebRTCConnection();
            
            // Wait longer for connection stabilization
            console.log('Waiting for connection to fully stabilize...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check connection state
            if (this.peerConnection && 
                (this.peerConnection.connectionState === 'connected' ||
                 this.peerConnection.connectionState === 'connecting')) {
                
                console.log('WebRTC connection established successfully');
                this.connected = true;
                
                // Update UI
                this.connectButton.textContent = 'Disconnect Voice Assistant';
                this.updateStatus('Connected to voice assistant');
                // Don't show transcript anymore
                // this.showTranscript();
                
                // Update session with custom VR Pong game instructions
                setTimeout(() => this.updateSessionInstructions(), 2000);
                
                // Send the initial greeting message after a longer delay
                setTimeout(() => this.sendGreeting(), 8000);
            } else {
                throw new Error('WebRTC connection failed to establish');
            }
            
        } catch (err) {
            console.error('Error connecting to OpenAI:', err);
            this.updateStatus(`Connection error: ${err.message}`);
            
            // Clean up if connection failed
            await this.disconnect(true);
            
            // Schedule reconnection attempt
            setTimeout(() => {
                if (!this.isConnected && !this.isReconnecting) {
                    this.reconnect();
                }
            }, 5000);
        } finally {
            this.isReconnecting = false;
        }
    }
    
    async setupWebRTCConnection() {
        console.log('Setting up WebRTC connection...');
        
        try {
            // Create RTCPeerConnection with ICE servers
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
            
            // Log connection state changes
            this.peerConnection.addEventListener('connectionstatechange', () => {
                console.log('Connection state changed:', this.peerConnection.connectionState);
                this.handleConnectionStateChange();
            });
            
            // Log ICE connection state changes
            this.peerConnection.addEventListener('iceconnectionstatechange', () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            });
            
            // Handle ICE candidates
            this.peerConnection.addEventListener('icecandidate', event => {
                if (event.candidate) {
                    console.log('New ICE candidate:', event.candidate);
                }
            });
            
            // Create data channel for events
            this.dataChannel = this.peerConnection.createDataChannel('oai-events');
            
            // Set up data channel event handlers
            this.setupDataChannelHandlers();
            
            // Add local audio track to the peer connection
            if (this.mediaStream) {
                this.mediaStream.getAudioTracks().forEach(track => {
                    console.log('Adding audio track to peer connection:', track.label);
                    this.peerConnection.addTrack(track, this.mediaStream);
                });
            } else {
                console.error('No media stream available');
                throw new Error('Microphone access not available');
            }
            
            // Set up remote audio stream handling
            this.peerConnection.addEventListener('track', event => {
                console.log('Received remote track:', event.track.kind);
                
                // Handle audio tracks
                if (event.track.kind === 'audio' && event.streams && event.streams[0]) {
                    console.log('Setting remote audio stream to remoteAudioElement');
                    
                    // Create a copy of the stream for stability
                    const audioStream = new MediaStream();
                    audioStream.addTrack(event.track);
                    
                    // Set the stream to the audio element
                    this.remoteAudioElement.srcObject = audioStream;
                    
                    // Ensure remoteAudioElement plays the OpenAI audio
                    this.remoteAudioElement.onloadedmetadata = () => {
                        console.log('Remote audio metadata loaded, attempting to play');
                        this.remoteAudioElement.play()
                            .then(() => console.log('Remote audio playback started'))
                            .catch(err => console.error('Error playing remote audio:', err));
                    };
                    
                    // Set up broadcasting when the audio is ready
                    setTimeout(() => {
                        if (this.socket && this.isBroadcasting) {
                            console.log('Setting up audio broadcasting with socket ID:', this.socket.id);
                            this.setupAudioStreamBroadcasting(audioStream);
                        } else {
                            console.log('Not broadcasting audio - socket available:', !!this.socket, 'isBroadcasting:', this.isBroadcasting);
                        }
                    }, 1000);
                }
            });
            
            // Create SDP offer
            console.log('Creating SDP offer...');
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            console.log('SDP offer created and set as local description');
            
            // Send the SDP offer to OpenAI using the proxy server
            console.log('Sending SDP offer to OpenAI...');
            const baseUrl = '/api/openai-realtime-proxy'; // This should be implemented on your server
            const model = 'gpt-4o-mini-realtime-preview';
            
            // Fallback to direct API call if proxy not implemented
            const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/sdp'
                }
            });
            
            if (!sdpResponse.ok) {
                throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
            }
            
            // Get the SDP answer from the server
            const answerSdp = await sdpResponse.text();
            console.log('Received SDP answer from OpenAI');
            
            // Set the remote description (SDP answer)
            const answer = {
                type: 'answer',
                sdp: answerSdp
            };
            
            await this.peerConnection.setRemoteDescription(answer);
            console.log('Remote description (SDP answer) set successfully');
            
            // Wait for ICE gathering to complete
            if (this.peerConnection.iceGatheringState !== 'complete') {
                await new Promise(resolve => {
                    const checkState = () => {
                        if (this.peerConnection.iceGatheringState === 'complete') {
                            resolve();
                        } else {
                            setTimeout(checkState, 500);
                        }
                    };
                    checkState();
                });
            }
            
            console.log('ICE gathering complete, connection being established...');
            
            // Wait for connection to establish
            if (this.peerConnection.connectionState !== 'connected') {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('WebRTC connection timeout'));
                    }, 15000);
                    
                    const checkState = () => {
                        if (this.peerConnection.connectionState === 'connected') {
                            clearTimeout(timeout);
                            resolve();
                        } else if (this.peerConnection.connectionState === 'failed' || 
                                   this.peerConnection.connectionState === 'closed') {
                            clearTimeout(timeout);
                            reject(new Error('WebRTC connection failed'));
                        } else {
                            setTimeout(checkState, 500);
                        }
                    };
                    
                    checkState();
                });
            }
            
            console.log('WebRTC connection successfully established');
            
        } catch (error) {
            console.error('Error in WebRTC setup:', error);
            throw error;
        }
    }
    
    setupDataChannelHandlers() {
        if (!this.dataChannel) return;
        
        // Handle data channel open
        this.dataChannel.addEventListener('open', () => {
            console.log('Data channel opened');
            
            // Start heartbeat when channel opens
            this.startHeartbeat();
        });
        
        // Handle data channel close
        this.dataChannel.addEventListener('close', () => {
            console.log('Data channel closed');
            
            // Stop heartbeat when channel closes
            this.stopHeartbeat();
        });
        
        // Handle incoming messages
        this.dataChannel.addEventListener('message', event => {
            try {
                // Only log important messages, not session updates
                const data = JSON.parse(event.data);
                
                // Skip logging for session updates and other frequent messages
                if (!data.type.includes('session') && 
                    !data.type.includes('rate_limits') && 
                    !data.type.includes('output_audio_buffer')) {
                    console.log('Received message on data channel:', event.data);
                }
                
                // Check for content type errors and adapt
                if (data.type === 'error' && data.error && 
                    data.error.param === 'item.content[0].type') {
                    this.handleContentTypeError(data.error);
                }
                
                // Handle different types of messages
                if (data.type === 'response.audio_transcript.done' || 
                    data.type === 'response.audio_transcript.delta') {
                    this.handleTranscriptUpdate(data);
                } else if (data.type === 'conversation.item.created') {
                    this.handleMessageUpdate(data);
                } else if (data.type === 'session.created') {
                    // Only update instructions when session is first created, not on every update
                    this.updateSessionInstructions();
                }
            } catch (error) {
                console.error('Error processing data channel message:', error);
            }
        });
        
        // Handle errors with improved recovery
        this.dataChannel.addEventListener('error', this.handleDataChannelError.bind(this));
    }
    
    handleTranscriptUpdate(data) {
        if (data.type === 'response.audio_transcript.done' && data.transcript) {
            console.log('Transcript update (complete):', data.transcript);
            this.transcript = data.transcript;
            this.updateTranscript(data.transcript);
        } else if (data.type === 'response.audio_transcript.delta' && data.delta) {
            // Skip logging individual delta updates to reduce console spam
            this.transcript += data.delta;
            this.updateTranscript(this.transcript, true);
        }
    }
    
    handleMessageUpdate(data) {
        if (data.content) {
            console.log('Message from assistant:', data.content);
            this.addMessage('assistant', data.content);
        }
    }
    
    handleConnectionStateChange() {
        const state = this.peerConnection.connectionState;
        
        switch (state) {
            case 'connected':
                this.isConnected = true;
                this.updateStatus('Connected to voice assistant');
                break;
                
            case 'disconnected':
            case 'failed':
                this.isConnected = false;
                this.updateStatus(`Connection ${state}. Attempting to reconnect...`);
                if (!this.isReconnecting) {
                    setTimeout(() => this.reconnect(), 5000);
                }
                break;
                
            case 'closed':
                this.isConnected = false;
                this.updateStatus('Disconnected');
                break;
                
            default:
                // For 'new', 'connecting', etc.
                break;
        }
    }
    
    async disconnect(isError = false) {
        try {
            // Stop media streams
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Stopped media track:', track.label);
                });
                this.mediaStream = null;
            }
            
            // Close data channel
            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
                console.log('Data channel closed');
            }
            
            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
                console.log('Peer connection closed');
            }
            
            // Close audio context
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
                this.audioContext = null;
                console.log('Audio context closed');
            }
            
            // Update UI
            this.isConnected = false;
            
            if (!isError) {
                this.connectButton.textContent = 'Connect Voice Assistant';
                this.updateStatus('Disconnected');
                // Don't need to hide transcript anymore
                // this.hideTranscript();
            }
            
        } catch (error) {
            console.error('Error disconnecting:', error);
            this.updateStatus('Disconnection error: ' + error.message);
            
            // Ensure we're fully cleaned up even if there was an error
            this.peerConnection = null;
            this.dataChannel = null;
            this.isConnected = false;
        }
    }
    
    async reconnect() {
        console.log('Attempting to reconnect...');
        
        // Avoid multiple simultaneous reconnection attempts
        if (this.isReconnecting) {
            console.log('Already reconnecting, skipping additional attempt');
            return;
        }
        
        this.isReconnecting = true;
        this.updateStatus('Reconnecting...');
        
        // Track reconnection attempts
        this.reconnectAttempts++;
        
        // If we've tried too many times, give up and ask user to manually reconnect
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.log(`Exceeded maximum reconnection attempts (${this.maxReconnectAttempts})`);
            this.updateStatus('Connection lost. Please reconnect manually.');
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            return;
        }
        
        try {
            // Disconnect first to clean up
            await this.disconnect(true);
            
            // Wait for resources to be released - increase wait time with each attempt
            const backoffTime = Math.min(3000 + (this.reconnectAttempts * 1000), 10000);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            
            // Reconnect
            await this.connect();
            
            // Reset reconnect attempts on success
            this.reconnectAttempts = 0;
            
        } catch (err) {
            console.error('Error during reconnection:', err);
            this.updateStatus(`Reconnection failed: ${err.message}`);
            this.isConnected = false;
            
            // Schedule another attempt with exponential backoff
            const nextAttemptDelay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts), 30000);
            setTimeout(() => {
                if (!this.isConnected && !this.isReconnecting) {
                    this.reconnect();
                }
            }, nextAttemptDelay);
        } finally {
            this.isReconnecting = false;
        }
    }
    
    async initializeAudio() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created and running:', this.audioContext.state);
            
            // Resume audio context if it's suspended (needed for Chrome)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('Audio context resumed:', this.audioContext.state);
            }
            
            // Get microphone access with specified constraints
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });
            
            console.log('Microphone access granted');
            
            // Store the media stream
            this.mediaStream = stream;
            
            // Play a test sound to verify audio output is working
            await this.playTestSound();
            
            console.log('Audio system fully initialized');
            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            this.updateStatus(`Audio error: ${error.message}`);
            return false;
        }
    }
    
    // Play a test sound to verify audio output works
    async playTestSound() {
        if (!this.audioContext) return;
        
        try {
            console.log('Playing test sound...');
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // 440Hz = A4 note
            oscillator.connect(gainNode);
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime); // Low volume
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.2); // Play for 0.2 seconds
            
            // Wait for the sound to finish
            await new Promise(resolve => setTimeout(resolve, 300));
            
            console.log('Test sound completed');
            return true;
        } catch (error) {
            console.error('Error playing test sound:', error);
            return false;
        }
    }
    
    // Helper methods for UI updates
    updateStatus(status) {
        if (this.voiceStatus) {
            this.voiceStatus.textContent = status;
            console.log('Voice status updated:', status);
        }
    }
    
    updateTranscript(text, isDelta = false) {
        // Don't update the transcript element since we're not showing it
        // if (this.transcriptElement) {
        //     this.transcriptElement.textContent = text;
        // }
        
        // Just log the transcript for debugging, but skip delta updates
        if (!isDelta) {
            console.log('Transcript update:', text);
        }
    }
    
    showTranscript() {
        if (this.transcriptElement) {
            this.transcriptElement.style.display = 'block';
        }
    }
    
    hideTranscript() {
        if (this.transcriptElement) {
            this.transcriptElement.style.display = 'none';
        }
    }
    
    // Add a message to the transcript
    addMessage(role, text) {
        // Don't add messages to the transcript element since we're not showing it
        // if (!this.transcriptElement) return;
        // 
        // // Create message element
        // const messageDiv = document.createElement('div');
        // messageDiv.classList.add('message', role);
        // 
        // // Create label
        // const label = document.createElement('span');
        // label.classList.add('label');
        // label.textContent = role === 'user' ? 'You: ' : 'Assistant: ';
        // 
        // // Create text content
        // const content = document.createElement('span');
        // content.classList.add('content');
        // content.textContent = text;
        // 
        // // Add to message
        // messageDiv.appendChild(label);
        // messageDiv.appendChild(content);
        // 
        // // Add to transcript
        // this.transcriptElement.appendChild(messageDiv);
        // 
        // // Scroll to bottom
        // this.transcriptElement.scrollTop = this.transcriptElement.scrollHeight;
        
        // Just log the message for debugging
        console.log(`${role} message: ${text}`);
    }
    
    // Send a message through the data channel with rate limiting
    async sendDataChannelMessage(payload) {
        if (!this.isConnected || !this.dataChannel) {
            console.error('Cannot send message: not connected');
            return false;
        }
        
        // Check data channel state before adding to queue
        if (this.dataChannel.readyState !== 'open') {
            console.error('Data channel not open, state:', this.dataChannel.readyState);
            
            // Don't add to queue if channel is closed or closing
            if (this.dataChannel.readyState === 'closed' || this.dataChannel.readyState === 'closing') {
                console.log('Data channel is closed or closing, scheduling reconnection');
                if (!this.isReconnecting) {
                    setTimeout(() => this.reconnect(), 3000);
                }
                return false;
            }
            
            // If channel is connecting, we can queue the message
            if (this.dataChannel.readyState === 'connecting') {
                console.log('Data channel is connecting, queueing message');
            }
        }
        
        try {
            // Validate message format before queueing
            const message = typeof payload === 'string' ? JSON.parse(payload) : payload;
            
            // Ensure message has required fields
            if (!message.type) {
                console.error('Invalid message format: missing type field');
                return false;
            }
            
            // For conversation items, ensure correct content type based on role
            if (message.type === 'conversation.item.create' && 
                message.item && 
                message.item.content && 
                message.item.content.length > 0) {
                
                const role = message.item.role;
                const contentType = message.item.content[0].type;
                
                // FIXED: OpenAI expects different content types for different roles
                // - User and System messages should use 'input_text'
                // - Assistant messages should use 'text'
                if ((role === 'user' || role === 'system') && contentType !== 'input_text') {
                    console.log(`Correcting content type for ${role} message from '${contentType}' to 'input_text'`);
                    message.item.content[0].type = 'input_text';
                } else if (role === 'assistant' && contentType !== 'text') {
                    console.log(`Correcting content type for assistant message from '${contentType}' to 'text'`);
                    message.item.content[0].type = 'text';
                }
                
                // Re-stringify with corrected format
                payload = JSON.stringify(message);
            }
            
            // Add to queue
            this.messageQueue.push(payload);
            
            // Process queue if not already processing
            if (!this.isProcessingQueue) {
                this.processMessageQueue();
            }
            
            return true;
        } catch (error) {
            console.error('Error preparing message:', error);
            return false;
        }
    }
    
    // Process message queue with rate limiting
    async processMessageQueue() {
        if (this.messageQueue.length === 0) {
            this.isProcessingQueue = false;
            return;
        }
        
        this.isProcessingQueue = true;
        
        // Check if we need to wait before sending the next message
        const now = Date.now();
        const timeSinceLastMessage = now - this.lastMessageTime;
        const minMessageInterval = 300; // Minimum 300ms between messages
        
        if (timeSinceLastMessage < minMessageInterval) {
            // Wait before sending next message
            await new Promise(resolve => setTimeout(resolve, minMessageInterval - timeSinceLastMessage));
        }
        
        // Get next message from queue
        const payload = this.messageQueue.shift();
        
        try {
            // Check data channel state
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                console.error('Data channel not open or null, state:', this.dataChannel ? this.dataChannel.readyState : 'null');
                
                // Put message back in queue if it's important and channel might reopen
                if (this.dataChannel && this.dataChannel.readyState === 'connecting') {
                    console.log('Data channel is connecting, returning message to queue');
                    this.messageQueue.unshift(payload);
                    
                    // Wait and check again
                    setTimeout(() => {
                        this.isProcessingQueue = false;
                        this.processMessageQueue();
                    }, 1000);
                    return;
                } else if (this.messageQueue.length < 10) { // Keep queue reasonably sized
                    this.messageQueue.unshift(payload);
                }
                
                // Try to reconnect if not already reconnecting
                if (!this.isReconnecting) {
                    this.updateStatus('Connection issue - attempting to reconnect...');
                    setTimeout(() => this.reconnect(), 3000);
                }
                
                this.isProcessingQueue = false;
                return;
            }
            
            // Log message type for debugging (but not the full payload)
            try {
                const msgObj = JSON.parse(payload);
                console.log(`Sending message type: ${msgObj.type}`);
            } catch (e) {
                // Not JSON or couldn't parse
            }
            
            // Send the message
            this.dataChannel.send(payload);
            this.lastMessageTime = Date.now();
            
            // Process next message with a small delay
            setTimeout(() => this.processMessageQueue(), 50);
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Put message back in queue if it's important
            if (this.messageQueue.length < 10) { // Don't let queue get too large
                this.messageQueue.unshift(payload);
            }
            
            // Try to reconnect on error if not already reconnecting
            if (!this.isReconnecting) {
                setTimeout(() => this.reconnect(), 3000);
            }
            
            this.isProcessingQueue = false;
        }
    }
    
    // Heartbeat to keep connection alive
    startHeartbeat() {
        // Removing heartbeat functionality as it's causing disconnections
        // The OpenAI API doesn't support 'ping' message type
        console.log('Heartbeat functionality disabled to prevent disconnections');
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    // Handle content type errors and adapt
    handleContentTypeError(error) {
        console.log('Content type error detected:', error.message);
        
        // Log the correct content types to use based on OpenAI's API requirements
        console.log('OpenAI WebRTC API requires specific content types:');
        console.log('- User messages must use "input_text"');
        console.log('- System messages must use "input_text"');
        console.log('- Assistant messages must use "text"');
        
        // Mark the time of the error to prevent immediate reconnection
        this.lastContentTypeError = Date.now();
        
        // Log the error details for debugging
        console.log('Content type error handled, continuing with connection');
        console.log('Error details:', JSON.stringify(error));
    }
    
    // Properly disconnect the WebRTC connection when a data channel error occurs
    handleDataChannelError(error) {
        console.error('Data channel error:', error);
        
        // Check if this is a content type error that we've already handled
        const now = Date.now();
        if (this.lastContentTypeError && (now - this.lastContentTypeError < 5000)) {
            console.log('Ignoring data channel error shortly after content type error');
            return;
        }
        
        // Extract error information if available
        let errorMessage = '';
        if (error && error.error) {
            errorMessage = error.error.message || 'Unknown error';
        } else if (error && typeof error === 'object') {
            errorMessage = JSON.stringify(error);
        } else if (error) {
            errorMessage = error.toString();
        }
        
        console.log(`Data channel error details: ${errorMessage}`);
        
        // If this is a content type error, handle it without disconnecting
        if (errorMessage.includes('content') && errorMessage.includes('type')) {
            console.log('Detected content type error, handling without disconnection');
            this.lastContentTypeError = Date.now();
            return;
        }
        
        // Check if the error is related to the connection being closed already
        if (!this.dataChannel || this.dataChannel.readyState === 'closed' || this.dataChannel.readyState === 'closing') {
            console.log('Data channel already closed or closing, scheduling delayed reconnect');
            
            // Schedule a delayed reconnect instead of immediate
            if (!this.isReconnecting) {
                setTimeout(() => {
                    if (!this.isConnected && !this.isReconnecting) {
                        this.reconnect();
                    }
                }, 5000);
            }
            return;
        }
        
        // Track error frequency to prevent reconnection loops
        if (!this.errorCount) this.errorCount = 0;
        if (!this.lastErrorTime) this.lastErrorTime = 0;
        
        // Reset error count if it's been more than 30 seconds since last error
        if (now - this.lastErrorTime > 30000) {
            this.errorCount = 0;
        }
        
        this.errorCount++;
        this.lastErrorTime = now;
        
        // If we're getting too many errors in a short time, back off
        if (this.errorCount > 5) {
            console.log('Too many errors in a short time, backing off from reconnection attempts');
            this.updateStatus('Connection unstable - please try again later');
            
            // Reset after a longer cooldown period
            setTimeout(() => {
                this.errorCount = 0;
                this.isReconnecting = false;
            }, 60000);
            
            return;
        }
        
        // Only attempt to reconnect if we're not already in the process
        if (!this.isReconnecting) {
            console.log('Data channel error detected, scheduling reconnect');
            this.updateStatus('Connection error - attempting to reconnect...');
            
            // Mark as reconnecting to prevent multiple attempts
            this.isReconnecting = true;
            
            // Calculate backoff time based on error count
            const backoffTime = Math.min(3000 * Math.pow(1.5, this.errorCount), 30000);
            
            // Fully disconnect then reconnect after a longer delay
            setTimeout(async () => {
                try {
                    // First disconnect cleanly
                    await this.disconnect(true);
                    
                    // Wait for resources to be released
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Then attempt to reconnect
                    await this.connect();
                    
                    // Reset reconnection flag and error count on success
                    this.isReconnecting = false;
                    this.errorCount = 0;
                } catch (reconnectError) {
                    console.error('Failed to reconnect after data channel error:', reconnectError);
                    this.updateStatus('Connection failed - please try again');
                    this.isReconnecting = false;
                    
                    // If reconnection fails, wait longer before trying again
                    setTimeout(() => {
                        if (!this.isConnected && !this.isReconnecting) {
                            this.connect();
                        }
                    }, 10000);
                }
            }, backoffTime);
        }
    }
    
    // Get the current content type to use based on role
    getCurrentContentType(role) {
        // According to OpenAI documentation and the error messages:
        // - User and System messages should use 'input_text'
        // - Assistant messages should use 'text'
        return role === 'assistant' ? 'text' : 'input_text';
    }
    
    // Send initial greeting message using the correct format
    async sendGreeting() {
        console.log('Sending initial greeting...');
        
        // Define simple greeting message without game-specific content
        const greetingMessage = "Hello! I'm an AI assistant for this VR Pong game. Game updates are currently disabled for testing. How can I help you?";
        
        try {
            // Wait to ensure connection is stable
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check connection
            if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
                console.log('Not connected or data channel not ready, cannot send greeting');
                return;
            }
            
            // Update UI
            this.updateStatus(`Assistant greeting: ${greetingMessage}`);
            this.addMessage('assistant', greetingMessage);
            
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'assistant',
                    content: [{
                        type: 'text', // Assistant messages use 'text' type
                        text: greetingMessage
                    }]
                }
            });
            
            // Use the rate-limited message sender
            await this.sendDataChannelMessage(payload);
            console.log('Initial greeting sent successfully');
            
            // Request a response
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            // Wait a moment before requesting a response
            setTimeout(() => {
                this.sendDataChannelMessage(responsePayload);
            }, 500);
            
        } catch (error) {
            console.error('Error sending greeting:', error);
        }
    }
    
    // Send game state updates to OpenAI
    sendGameStateUpdate(eventType, extraData = {}) {
        try {
            // Skip if not connected or data channel isn't ready
            if (!this.connected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
                return;
            }
            
            // Update our internal state tracking
            if (extraData.playerScore !== undefined) this.playerScore = extraData.playerScore;
            if (extraData.aiScore !== undefined) this.aiScore = extraData.aiScore;
            if (extraData.gameTimerValue !== undefined) this.gameTimerValue = extraData.gameTimerValue;
            if (extraData.gameInProgress !== undefined) this.gameInProgress = extraData.gameInProgress;
            
            // Only process critical game events to minimize messages
            let updateMessage = '';
            
            switch (eventType) {
                case 'game_started':
                    updateMessage = 'Game started. Good luck!';
                    break;
                case 'game_ended':
                    const result = this.playerScore > this.aiScore ? 'You won' : 
                                  this.playerScore < this.aiScore ? 'AI won' : 'Game ended in a tie';
                    updateMessage = `Game ended. ${result}. Final score: You ${this.playerScore} - AI ${this.aiScore}`;
                    break;
                default:
                    // Skip all other event types to minimize messages
                    return;
            }
            
            console.log(`Game state update: ${updateMessage}`);
            
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text', // System messages must use 'input_text' type
                        text: updateMessage
                    }]
                }
            });
            
            // Send the update
            this.sendDataChannelMessage(payload);
            
            // Request a response only for game end events
            if (eventType === 'game_ended') {
                setTimeout(() => {
                    const responsePayload = JSON.stringify({
                        type: 'response.create'
                    });
                    this.sendDataChannelMessage(responsePayload);
                }, 500);
            }
            
        } catch (error) {
            console.error('Error sending game state update:', error);
        }
    }
    
    // Update session with custom instructions about the VR Pong game
    updateSessionInstructions() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('Cannot update session instructions: data channel not ready');
            return;
        }
        
        console.log('Updating session with simplified VR Pong instructions');
        
        const instructions = `
You are an AI voice assistant integrated into a Virtual Reality Pong game.

IMPORTANT: You will receive minimal game state updates (only game start, game end, and key menu selections).
You should respond naturally to these updates with brief, encouraging comments.

Your main tasks:
1. Acknowledge when a game starts with brief encouragement
2. Congratulate or console the player when a game ends based on the result
3. Acknowledge when player selects difficulty levels or game modes
4. Respond to any direct questions from the player

Keep your responses concise and focused on the game.
`;
        
        try {
            // Format system message
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text',
                        text: instructions
                    }]
                }
            });
            
            // Send the instructions
            this.sendDataChannelMessage(payload);
            this.updateStatus('Session instructions updated - minimal game updates enabled');
            console.log('Session instructions updated successfully');
            
        } catch (error) {
            console.error('Error updating session instructions:', error);
        }
    }
    
    // Send a text message through the data channel
    async sendTextMessage(message) {
        if (!this.isConnected || !this.dataChannel) {
            console.error('Cannot send message: not connected');
            this.updateStatus('Not connected - please reconnect');
            return null;
        }
        
        try {
            console.log('Sending text message:', message);
            
            // Update UI
            this.updateStatus(`User: ${message}`);
            this.addMessage('user', message);
            
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_text', // User messages always use 'input_text' type
                        text: message
                    }]
                }
            });
            
            // Use the rate-limited message sender
            const sent = await this.sendDataChannelMessage(payload);
            
            if (sent) {
                console.log('Message sent successfully');
                
                // Request a response after sending the message
                const responsePayload = JSON.stringify({
                    type: 'response.create'
                });
                
                setTimeout(() => {
                    this.sendDataChannelMessage(responsePayload);
                    console.log('Response request sent');
                }, 500);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error sending message:', error);
            this.updateStatus(`Error sending message: ${error.message}`);
            
            // Try to reconnect if there's a connection issue
            if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
                this.reconnect();
            }
            
            return false;
        }
    }
    
    // Add this new method to periodically send gameplay tips
    startGameplayTipsTimer() {
        // Clear any existing timer
        this.stopGameplayTipsTimer();
        
        // Send gameplay tips every 30-60 seconds, with variation based on game state
        this.tipsTimer = setInterval(() => {
            if (!this.isConnected || !this.gameInProgress) {
                this.stopGameplayTipsTimer();
                return;
            }
            
            // Only send tips if the game has been going for a while
            const gameTime = Date.now() - this.gameStartTime;
            if (gameTime < 15000) { // Don't send tips in the first 15 seconds
                return;
            }
            
            // Check if we should send a tip based on game state
            const playerScore = this.playerScore;
            const aiScore = this.aiScore;
            const scoreDifference = Math.abs(playerScore - aiScore);
            const playerLeading = playerScore > aiScore;
            const aiLeading = aiScore > playerScore;
            
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
            
            // Also announce the current time remaining occasionally
            if (this.gameTimerRunning && this.gameTimerValue > 0 && Math.random() < 0.4) {
                this.announceTimeRemaining();
            }
            
        }, 30000); // Check every 30 seconds
    }
    
    // New method to announce time remaining
    announceTimeRemaining() {
        if (!this.connected || !this.gameInProgress || !this.gameTimerRunning) return;
        
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
        
        if (this.connected) {
            // Send as a system message
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text',
                        text: timeMessage
                    }]
                }
            });
            
            // Send the message
            this.sendDataChannelMessage(payload);
            console.log(`Time announcement sent: ${timeMessage}`);
            
            // Request a response
            setTimeout(() => {
                if (this.connected) {
                    const responsePayload = JSON.stringify({
                        type: 'response.create'
                    });
                    this.sendDataChannelMessage(responsePayload);
                }
            }, 500);
        }
    }
    
    stopGameplayTipsTimer() {
        if (this.tipsTimer) {
            clearInterval(this.tipsTimer);
            this.tipsTimer = null;
        }
    }
    
    sendGameplayTip() {
        if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }
        
        const playerScore = this.playerScore;
        const aiScore = this.aiScore;
        const playerLeading = playerScore > aiScore;
        const aiLeading = aiScore > playerScore;
        
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
        
        try {
            // Update UI
            this.updateStatus(`Gameplay tip: ${tipMessage}`);
            this.addMessage('system', tipMessage);
            
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text', // System messages must use 'input_text' type
                        text: tipMessage
                    }]
                }
            });
            
            // Send the tip via the data channel
            this.sendDataChannelMessage(payload);
            console.log(`Gameplay tip sent: ${tipMessage}`);
            
            // Request a response 
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            setTimeout(() => {
                this.sendDataChannelMessage(responsePayload);
            }, 500);
            
        } catch (error) {
            console.error('Error sending gameplay tip:', error);
        }
    }
    
    // Set up broadcast of audio stream to other players
    setupAudioStreamBroadcasting(audioStream) {
        if (!this.socket || !this.socket.connected) {
            console.log('No active socket connection, AI audio will be local only');
            return;
        }
        
        if (!audioStream || !audioStream.getAudioTracks || audioStream.getAudioTracks().length === 0) {
            console.error('Invalid audio stream for broadcasting');
            return;
        }
        
        // Get room ID from socket
        this.socket.emit('get-room-id', (roomId) => {
            if (!roomId) {
                console.log('Not in a game room, AI audio will be local only');
                return;
            }
            
            this.broadcastingRoomId = roomId;
            console.log(`Setting up audio stream broadcasting to other players in room ${roomId}`);
            
            // Only proceed if we're the host or broadcastingEnabled flag is set
            if (!this.broadcastingEnabled && window.isHost !== true) {
                console.log('Broadcasting disabled or not the host, skipping audio broadcast setup');
                return;
            }
            
            try {
                // Ensure we have the audio context set up
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                // Set up MediaRecorder for the audio stream
                const setupMediaRecorder = () => {
                    // Use specific options for WebM with Opus codec for best compatibility
                    const options = { 
                        mimeType: 'audio/webm;codecs=opus',
                        audioBitsPerSecond: 32000  // Lower bitrate for smaller packets
                    };
                    
                    try {
                        // Create a media recorder with the specified options
                        this.mediaRecorder = new MediaRecorder(audioStream, options);
                        console.log('MediaRecorder created with options:', options);
                        
                        // Set up data handling
                        this.mediaRecorder.ondataavailable = (event) => {
                            if (event.data && event.data.size > 0 && this.broadcastingEnabled) {
                                this.handleAudioBroadcastData(event.data);
                            }
                        };
                        
                        // Handle errors
                        this.mediaRecorder.onerror = (error) => {
                            console.error('MediaRecorder error:', error);
                        };
                        
                        // Start recording with a small timeslice for low latency
                        this.mediaRecorder.start(200);  // Capture in 200ms chunks for lower latency
                        console.log('MediaRecorder started, broadcasting enabled');
                        this.broadcastingEnabled = true;
                    } catch (error) {
                        console.error('Failed to create MediaRecorder with opus codec:', error);
                        
                        // Try again with default options
                        try {
                            this.mediaRecorder = new MediaRecorder(audioStream);
                            console.log('MediaRecorder created with default options');
                            
                            this.mediaRecorder.ondataavailable = (event) => {
                                if (event.data && event.data.size > 0 && this.broadcastingEnabled) {
                                    this.handleAudioBroadcastData(event.data);
                                }
                            };
                            
                            this.mediaRecorder.onerror = (error) => {
                                console.error('MediaRecorder error:', error);
                            };
                            
                            this.mediaRecorder.start(200);
                            this.broadcastingEnabled = true;
                        } catch (fallbackError) {
                            console.error('Failed to create MediaRecorder with any options:', fallbackError);
                            this.broadcastingEnabled = false;
                        }
                    }
                };
                
                // Set up the media recorder
                setupMediaRecorder();
                
            } catch (error) {
                console.error('Error setting up audio broadcasting:', error);
                this.broadcastingEnabled = false;
            }
        });
    }
    
    handleAudioBroadcastData(data) {
        // Skip if broadcasting is disabled
        if (!this.broadcastingEnabled || !this.socket || !this.socket.connected) {
            return;
        }
        
        // Throttle broadcasts to prevent overloading the network
        const now = Date.now();
        if (this.lastBroadcastTime && now - this.lastBroadcastTime < 200) {
            // console.log('Throttling broadcast, too soon since last one');
            return;
        }
        this.lastBroadcastTime = now;
        
        try {
            // Convert the blob to base64
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                
                // Check data size - don't send huge packets
                if (base64data.length > 100000) {
                    console.warn(`Audio data too large (${base64data.length} bytes), skipping broadcast`);
                    return;
                }
                
                // Send data through socket.io
                console.log(`AI audio broadcast sent: ${base64data.length} bytes to room ${this.broadcastingRoomId}`);
                this.socket.emit('ai-audio-broadcast', base64data);
            };
            
            reader.readAsDataURL(data);
        } catch (error) {
            console.error('Error processing audio data for broadcast:', error);
        }
    }
    
    // Method to update the socket after initialization
    updateSocketConnection(newSocket) {
        if (!newSocket || typeof newSocket.emit !== 'function') {
            console.log('Invalid socket provided to updateSocketConnection');
            return false;
        }
        
        console.log(`Updating socket connection. New socket ID: ${newSocket.id}`);
        
        // Store the new socket
        this.socket = newSocket;
        
        // If we already have an audio element, set up broadcasting
        if (this.remoteAudioElement && this.remoteAudioElement.srcObject) {
            console.log('Setting up audio stream broadcasting with updated socket');
            this.setupAudioStreamBroadcasting(this.remoteAudioElement.srcObject);
        } else {
            console.log('Audio element not ready yet, will set up broadcasting when audio is available');
        }
        
        // Set up receiver for AI audio from other players
        this.setupAIAudioReceiver();
        
        // If successful, update status
        this.isBroadcasting = true;
        console.log('Socket connection updated successfully');
        
        return true;
    }
    
    // Cleanup method - add teardown for broadcasting
    cleanup() {
        // Stop broadcasting if active
        if (this.audioProcessor && this.audioProcessor.state !== 'inactive') {
            try {
                this.audioProcessor.stop();
            } catch (error) {
                console.error('Error stopping audio processor:', error);
            }
        }
        
        // ... existing cleanup code if any ...
    }
    
    // Reset the assistant's state for a new game
    resetAssistantState() {
        console.log('Resetting assistant state for new game');
        
        // Reset game state variables
        this.gameInProgress = false;
        this.playerScore = 0;
        this.aiScore = 0;
        this.gameTimerValue = 150;
        this.gameTimerRunning = false;
        this.lastMessageTime = 0;
        
        // If not connected, there's nothing more to do
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('Cannot reset assistant: data channel not open');
            return;
        }
        
        // Wait a bit to ensure separation between game sessions
        setTimeout(() => {
            try {
                // Send a simplified reset message to the assistant
                const resetInstructions = 
                `GAME RESET: Testing has been reset. You are an AI assistant helping with a VR Pong game.
                
                [IMPORTANT]: Game state updates are temporarily disabled for testing purposes.
                If asked about game state, please respond that you don't have any game information at this time.`;
                
                // Format message according to OpenAI's WebRTC API requirements
                const payload = JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'system',
                        content: [{
                            type: 'input_text', // System messages must use 'input_text' type
                            text: resetInstructions
                        }]
                    }
                });
                
                // Send the reset message
                this.sendDataChannelMessage(payload);
                console.log('Reset instructions sent to assistant');
                
                // Let the user know the assistant has been reset
                this.updateStatus('Assistant reset - game updates disabled');
                this.addMessage('system', 'Assistant has been reset - game updates disabled');
                
            } catch (error) {
                console.error('Error resetting assistant state:', error);
            }
        }, 1500); // Wait 1.5 seconds to ensure proper separation
    }
    
    /**
     * This method should be called directly from game button handlers
     * to accurately report button presses
     */
    reportMenuButtonPress(buttonName) {
        if (!this.connected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }
        
        console.log(`Menu button actually pressed: ${buttonName}`);
        
        // Only process specific key menu choices
        let updateMessage = '';
        
        switch (buttonName.toLowerCase()) {
            case 'start':
                updateMessage = 'Player navigated to main menu';
                break;
            case 'singleplayer':
                updateMessage = 'Player selected single player mode';
                break;
            case 'easy':
                updateMessage = 'Player selected easy difficulty';
                break;
            case 'medium':
                updateMessage = 'Player selected medium difficulty';
                break;
            case 'hard':
            case 'expert':
                updateMessage = 'Player selected expert difficulty';
                break;
            default:
                // Skip other menu buttons to keep messages minimal
                return;
        }
        
        if (updateMessage) {
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{
                        type: 'input_text', // System messages must use 'input_text' type
                        text: updateMessage
                    }]
                }
            });
            
            // Send the update
            this.sendDataChannelMessage(payload);
        }
    }
    
    // We'll rename this method to make it clearer that it's not used directly
    // but is exposed for game components to call
    sendMenuNavigationUpdate(buttonName) {
        // Call our new method directly - keeping this for backward compatibility
        this.reportMenuButtonPress(buttonName);
    }
}

// Initialize the OpenAI voice assistant when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event triggered for OpenAI voice assistant');
    
    // Check if we already have an OpenAI voice instance to prevent duplicates
    if (window.openAIVoice) {
        console.log('OpenAI Voice Assistant already initialized, skipping duplicate initialization');
        return;
    }
    
    // Delayed initialization to ensure UI elements are loaded
    setTimeout(() => {
        initializeOpenAIVoiceWithRetries();
    }, 1000);
    
    // Recursive function to retry initialization with increasing delays
    function initializeOpenAIVoiceWithRetries(attempt = 1, maxAttempts = 5) {
        console.log(`Attempt ${attempt}/${maxAttempts} to initialize OpenAI voice assistant`);
        
        // First check if the required UI elements exist in the DOM
        const connectButton = document.getElementById('connectOpenAI');
        const voiceStatus = document.getElementById('voiceStatus');
        
        if (connectButton && voiceStatus) {
            console.log('Required UI elements found in DOM, initializing OpenAI voice assistant');
            initializeOpenAIVoice();
        } else {
            console.log(`Required UI elements not found. Button: ${!!connectButton}, Status: ${!!voiceStatus}`);
            
            if (attempt < maxAttempts) {
                // Retry with exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.log(`Will retry in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
                
                setTimeout(() => {
                    initializeOpenAIVoiceWithRetries(attempt + 1, maxAttempts);
                }, delay);
            } else {
                console.log('Max attempts reached, initializing anyway and hoping for the best');
                initializeOpenAIVoice();
            }
        }
    }
    
    // Main initialization function
    function initializeOpenAIVoice() {
        // Try to determine if we're the host or guest
        try {
            // Check URL parameters first
            const urlParams = new URLSearchParams(window.location.search);
            const roomParam = urlParams.get('room');
            
            // If there's a room param, we're likely a guest joining that room
            if (roomParam) {
                window.isHost = false;
                console.log('Detected as GUEST player (from URL params)');
            } else if (window.game && window.game.multiplayerManager) {
                window.isHost = window.game.multiplayerManager.isHost;
                console.log('Detected as ' + (window.isHost ? 'HOST' : 'GUEST') + ' player (from game manager)');
            } else if (window.multiplayerManager) {
                window.isHost = window.multiplayerManager.isHost;
                console.log('Detected as ' + (window.isHost ? 'HOST' : 'GUEST') + ' player (from global manager)');
            } else {
                // Default to assuming we're the host if can't determine
                window.isHost = true;
                console.log('Could not determine if host/guest, defaulting to HOST');
            }
        } catch (e) {
            console.error('Error detecting host/guest status:', e);
            window.isHost = true; // Default to host on error
        }
        
        console.log('Searching for socket.io connection...');
        
        // Function to delay execution and wait for socket.io to initialize
        function waitForSocketInit(attemptCount = 0, maxAttempts = 30) {
            if (attemptCount >= maxAttempts) {
                console.log('Max attempts reached, initializing without multiplayer socket');
                createVoiceAssistantWithoutSocket();
                return;
            }
            
            // Check for socket.io connection
            console.log(`Socket detection attempt ${attemptCount + 1}/${maxAttempts}`);
            
            // NEW APPROACH: Check for active socket.io managers directly
            let socket = null;
            
            // Method 1: Look for active socket connections through io.managers
            if (window.io && typeof window.io === 'object' && window.io.managers) {
                const managerUrls = Object.keys(window.io.managers);
                if (managerUrls.length > 0) {
                    console.log(`Found ${managerUrls.length} socket.io manager(s):`, managerUrls);
                    
                    // Try to get the first active manager
                    for (const url of managerUrls) {
                        const manager = window.io.managers[url];
                        if (manager && manager.nsps) {
                            const namespaces = Object.keys(manager.nsps);
                            console.log(`Manager ${url} has namespaces:`, namespaces);
                            
                            // Try default namespace first
                            if (manager.nsps['/'] && manager.nsps['/'].connected) {
                                socket = manager.nsps['/'];
                                console.log('Found ACTIVE socket.io connection in default namespace!', socket.id);
                                break;
                            }
                            
                            // Try other namespaces if default not connected
                            for (const ns of namespaces) {
                                if (manager.nsps[ns].connected) {
                                    socket = manager.nsps[ns];
                                    console.log(`Found ACTIVE socket.io connection in namespace ${ns}!`, socket.id);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // Method 2: Check game object for multiplayer manager (most reliable)
            if (!socket && window.game && window.game.multiplayerManager) {
                const mpManager = window.game.multiplayerManager;
                if (mpManager.socket) {
                    socket = mpManager.socket;
                    console.log('Found socket in game.multiplayerManager', socket.id);
                }
            }
            
            // Method 3: Check for socket in global MultiplayerManager instances
            if (!socket && window.MultiplayerManager && window.MultiplayerManager.instance) {
                if (window.MultiplayerManager.instance.socket) {
                    socket = window.MultiplayerManager.instance.socket;
                    console.log('Found socket in MultiplayerManager.instance', socket.id);
                }
            }
            
            // Method 4: Check the network folder specifically
            if (!socket && window.network && window.network.socket) {
                socket = window.network.socket;
                console.log('Found socket in window.network', socket.id);
            }
            
            // If socket found, test if it's actually working
            if (socket) {
                // Test socket connection by pinging the server
                try {
                    // Local function for fallback testing
                    const testFallbackOrRetry = () => {
                        // Try get-room-id event as fallback test
                        socket.emit('get-room-id', (roomId) => {
                            clearTimeout(pingTimeout);
                            if (roomId) {
                                console.log('Room ID test successful, got room:', roomId);
                                createVoiceAssistantWithSocket(socket);
                            } else {
                                console.log('Socket found but not responding to tests, trying again...');
                                setTimeout(() => waitForSocketInit(attemptCount + 1, maxAttempts), 500);
                            }
                        });
                    };
                
                    socket.emit('ping_test', Date.now(), (response) => {
                        if (response) {
                            console.log('Socket connection test successful!', response);
                            createVoiceAssistantWithSocket(socket);
                        } else {
                            console.warn('Socket connection test received empty response');
                            testFallbackOrRetry();
                        }
                    });
                    
                    // Set timeout for ping response
                    const pingTimeout = setTimeout(() => {
                        console.warn('Socket ping test timed out');
                        testFallbackOrRetry();
                    }, 2000);
                } catch (e) {
                    console.error('Error testing socket:', e);
                    setTimeout(() => waitForSocketInit(attemptCount + 1, maxAttempts), 500);
                }
            } else {
                // No socket found, retry after delay
                setTimeout(() => waitForSocketInit(attemptCount + 1, maxAttempts), 500);
            }
        }
        
        // Function to create voice assistant with a socket
        function createVoiceAssistantWithSocket(socket) {
            // Verify socket is still connected
            if (!socket.connected) {
                console.warn('Socket not connected, initializing without multiplayer');
                createVoiceAssistantWithoutSocket();
                return;
            }
            
            console.log('Creating OpenAI Voice Assistant with socket', socket.id);
            
            // Check if instance already exists
            if (window.openAIVoice) {
                console.log('OpenAI Voice Assistant already exists, updating socket');
                window.openAIVoice.updateSocketConnection(socket);
                return;
            }
            
            // Create new instance
            window.openAIVoice = new OpenAIVoiceAssistant(socket);
            console.log('OpenAI Voice Assistant initialized with multiplayer broadcasting');
        }
        
        // Function to create voice assistant without a socket
        function createVoiceAssistantWithoutSocket() {
            console.log('Creating OpenAI Voice Assistant without multiplayer support');
            window.openAIVoice = new OpenAIVoiceAssistant(null);
            console.log('OpenAI Voice Assistant initialized for local use only');
            
            // Continue checking for socket in the background and update if found
            let backgroundCheckInterval = setInterval(() => {
                if (window.game && window.game.multiplayerManager && window.game.multiplayerManager.socket) {
                    console.log('Found socket in background check!', window.game.multiplayerManager.socket.id);
                    window.openAIVoice.updateSocketConnection(window.game.multiplayerManager.socket);
                    clearInterval(backgroundCheckInterval);
                }
            }, 5000); // Check every 5 seconds
        }
        
        // Start waiting for socket initialization
        waitForSocketInit();
    }
});