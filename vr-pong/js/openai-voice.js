/**
 * OpenAI WebRTC Voice Integration for VR Pong
 * This module handles the real-time voice communication with OpenAI's GPT-4o
 * Using native WebRTC implementation with server proxy for key management
 */

class OpenAIVoiceAssistant {
    constructor() {
        // Connection state
        this.peerConnection = null;
        this.dataChannel = null;
        this.isConnected = false;
        this.isReconnecting = false;
        this.apiKey = null;
        
        // Audio processing
        this.isListening = false;
        this.audioContext = null;
        this.mediaStream = null;
        this.remoteAudioElement = null;
        this.transcript = '';
        
        // Game state tracking
        this.gameState = {
            playerScore: 0,
            aiScore: 0,
            gameInProgress: false,
            lastScoreUpdate: Date.now(),
            consecutivePlayerScores: 0,
            consecutiveAiScores: 0,
            gameStartTime: null
        };
        
        // UI elements
        this.connectButton = document.getElementById('connectOpenAI');
        this.voiceStatus = document.getElementById('voiceStatus');
        this.transcriptElement = document.getElementById('openaiTranscript');
        
        // Bind event listeners
        this.bindEvents();
        
        // Create audio element for remote audio
        this.createRemoteAudioElement();
    }
    
    bindEvents() {
        if (this.connectButton) {
            this.connectButton.addEventListener('click', this.toggleConnection.bind(this));
        }
        
        // Add event listeners for game events
        document.addEventListener('game-started', () => {
            console.log('Game started, OpenAI voice assistant is ' + (this.isConnected ? 'active' : 'inactive'));
            this.gameState.gameInProgress = true;
            this.gameState.gameStartTime = Date.now();
            this.gameState.playerScore = 0;
            this.gameState.aiScore = 0;
            this.gameState.consecutivePlayerScores = 0;
            this.gameState.consecutiveAiScores = 0;
            
            // If connected, send a game start notification
            if (this.isConnected) {
                this.sendGameStateUpdate('game_started');
            }
        });
        
        document.addEventListener('game-ended', () => {
            console.log('Game ended');
            this.gameState.gameInProgress = false;
            
            // If connected, send a game end notification with final score
            if (this.isConnected) {
                this.sendGameStateUpdate('game_ended');
            }
        });
        
        // Listen for score updates
        document.addEventListener('score-update', (event) => {
            if (event.detail) {
                const oldPlayerScore = this.gameState.playerScore;
                const oldAiScore = this.gameState.aiScore;
                
                this.gameState.playerScore = event.detail.playerScore || 0;
                this.gameState.aiScore = event.detail.aiScore || 0;
                
                // Track consecutive scores
                if (oldPlayerScore < this.gameState.playerScore) {
                    this.gameState.consecutivePlayerScores++;
                    this.gameState.consecutiveAiScores = 0;
                    this.gameState.lastScoreUpdate = Date.now();
                    
                    // If connected, send a player score notification
                    if (this.isConnected) {
                        this.sendGameStateUpdate('player_scored');
                    }
                } else if (oldAiScore < this.gameState.aiScore) {
                    this.gameState.consecutiveAiScores++;
                    this.gameState.consecutivePlayerScores = 0;
                    this.gameState.lastScoreUpdate = Date.now();
                    
                    // If connected, send an AI score notification
                    if (this.isConnected) {
                        this.sendGameStateUpdate('ai_scored');
                    }
                }
                
                console.log(`Score updated - Player: ${this.gameState.playerScore}, AI: ${this.gameState.aiScore}`);
            }
        });
    }
    
    createRemoteAudioElement() {
        // Create audio element for remote audio if it doesn't exist
        if (!this.remoteAudioElement) {
            this.remoteAudioElement = document.createElement('audio');
            this.remoteAudioElement.id = 'openaiAudio';
            this.remoteAudioElement.autoplay = true;
            this.remoteAudioElement.style.display = 'none';
            document.body.appendChild(this.remoteAudioElement);
            console.log('Remote audio element created');
        }
    }
    
    async toggleConnection() {
        if (!this.isConnected) {
            await this.connect();
        } else {
            await this.disconnect();
        }
    }
    
    async connect() {
        try {
            // Update status
            this.updateStatus('Connecting...');
            
            // Request API key from user
            const apiKeyInput = prompt('Please enter your OpenAI API Key:', '');
            if (!apiKeyInput) {
                this.updateStatus('Connection cancelled');
                return;
            }
            
            this.apiKey = apiKeyInput.trim();
            
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
                this.isConnected = true;
                
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
                if (event.track.kind === 'audio' && event.streams && event.streams[0]) {
                    this.remoteAudioElement.srcObject = event.streams[0];
                    console.log('Remote audio stream connected');
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
        });
        
        // Handle data channel close
        this.dataChannel.addEventListener('close', () => {
            console.log('Data channel closed');
        });
        
        // Handle incoming messages
        this.dataChannel.addEventListener('message', event => {
            try {
                console.log('Received message on data channel:', event.data);
                const data = JSON.parse(event.data);
                
                // Handle different types of messages
                if (data.type === 'response.audio_transcript.done' || 
                    data.type === 'response.audio_transcript.delta') {
                    this.handleTranscriptUpdate(data);
                } else if (data.type === 'conversation.item.created') {
                    this.handleMessageUpdate(data);
                } else if (data.type === 'session.created' || data.type === 'session.updated') {
                    // When session is created or updated, set custom instructions
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
            console.log('Transcript update (delta):', data.delta);
            this.transcript += data.delta;
            this.updateTranscript(this.transcript);
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
        
        try {
            // Disconnect first to clean up
            await this.disconnect(true);
            
            // Wait for resources to be released
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Reconnect
            await this.connect();
            
        } catch (err) {
            console.error('Error during reconnection:', err);
            this.updateStatus(`Reconnection failed: ${err.message}`);
            this.isConnected = false;
            
            // Schedule another attempt
            setTimeout(() => {
                if (!this.isConnected && !this.isReconnecting) {
                    this.reconnect();
                }
            }, 10000);
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
    
    updateTranscript(text) {
        // Don't update the transcript element since we're not showing it
        // if (this.transcriptElement) {
        //     this.transcriptElement.textContent = text;
        // }
        
        // Just log the transcript for debugging
        console.log('Transcript update:', text);
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
            
            // Check data channel state
            if (this.dataChannel.readyState !== 'open') {
                console.error('Data channel not open, state:', this.dataChannel.readyState);
                
                // Try to reconnect
                if (!this.isReconnecting) {
                    this.updateStatus('Connection issue - attempting to reconnect...');
                    setTimeout(() => this.reconnect(), 1000);
                }
                
                return null;
            }
            
            // Format message according to OpenAI's WebRTC API requirements
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_text',
                        text: message
                    }]
                }
            });
            
            this.dataChannel.send(payload);
            console.log('Message sent successfully');
            
            // Request a response after sending the message
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            setTimeout(() => {
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(responsePayload);
                    console.log('Response request sent');
                }
            }, 500);
            
            return true;
        } catch (error) {
            console.error('Error sending text message:', error);
            this.updateStatus(`Error: ${error.message}`);
            
            // Try to reconnect on error
            if (!this.isReconnecting) {
                setTimeout(() => this.reconnect(), 3000);
            }
            
            return null;
        }
    }
    
    // Properly disconnect the WebRTC connection when a data channel error occurs
    handleDataChannelError(error) {
        console.error('Data channel error:', error);
        
        // Only attempt to reconnect if we're not already in the process
        if (!this.isReconnecting) {
            console.log('Data channel error detected, scheduling reconnect');
            this.updateStatus('Connection error - attempting to reconnect...');
            
            // Mark as reconnecting to prevent multiple attempts
            this.isReconnecting = true;
            
            // Fully disconnect then reconnect after a delay
            setTimeout(async () => {
                try {
                    // First disconnect cleanly
                    await this.disconnect(true);
                    
                    // Wait for resources to be released
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Then attempt to reconnect
                    await this.connect();
                    
                    // Reset reconnection flag
                    this.isReconnecting = false;
                } catch (reconnectError) {
                    console.error('Failed to reconnect after data channel error:', reconnectError);
                    this.updateStatus('Connection failed - please try again');
                    this.isReconnecting = false;
                    
                    // If reconnection fails, wait longer before trying again
                    setTimeout(() => {
                        if (!this.isConnected && !this.isReconnecting) {
                            this.connect();
                        }
                    }, 5000);
                }
            }, 1000);
        }
    }
    
    // Send initial greeting message using the correct format
    async sendGreeting() {
        console.log('Sending initial greeting...');
        
        // Define greeting message with game-specific content
        const greetingMessage = "Hello! I'm your VR Pong game assistant. I can help you with game rules, controls, strategies, or any questions about the game. How can I assist you with your VR Pong experience today?";
        
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
                        type: 'input_text',
                        text: greetingMessage
                    }]
                }
            });
            
            this.dataChannel.send(payload);
            console.log('Initial greeting sent successfully');
            
            // Request a response
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            // Wait a moment before requesting a response
            setTimeout(() => {
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(responsePayload);
                }
            }, 500);
            
        } catch (error) {
            console.error('Error sending greeting:', error);
        }
    }
    
    // Send real-time game state updates to OpenAI
    sendGameStateUpdate(eventType) {
        if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('Cannot send game state update: not connected');
            return;
        }
        
        let updateMessage = '';
        const scoreDifference = Math.abs(this.gameState.playerScore - this.gameState.aiScore);
        const isPlayerWinning = this.gameState.playerScore > this.gameState.aiScore;
        const isAiWinning = this.gameState.aiScore > this.gameState.playerScore;
        const isTied = this.gameState.playerScore === this.gameState.aiScore;
        
        switch (eventType) {
            case 'game_started':
                updateMessage = "The game has started! Good luck and have fun!";
                break;
                
            case 'game_ended':
                if (isPlayerWinning) {
                    updateMessage = `Game over! You won with a score of ${this.gameState.playerScore}-${this.gameState.aiScore}. Congratulations!`;
                } else if (isAiWinning) {
                    updateMessage = `Game over! The AI won with a score of ${this.gameState.aiScore}-${this.gameState.playerScore}. Better luck next time!`;
                } else {
                    updateMessage = `Game over! It's a tie with a score of ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                }
                break;
                
            case 'player_scored':
                if (this.gameState.consecutivePlayerScores >= 3) {
                    updateMessage = `Wow! You scored again! That's ${this.gameState.consecutivePlayerScores} points in a row! The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                } else if (scoreDifference >= 5 && isPlayerWinning) {
                    updateMessage = `You scored! You're dominating with a ${scoreDifference} point lead! The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                } else {
                    updateMessage = `You scored! The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                }
                break;
                
            case 'ai_scored':
                if (this.gameState.consecutiveAiScores >= 3) {
                    updateMessage = `The AI scored again! That's ${this.gameState.consecutiveAiScores} points in a row. The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                } else if (scoreDifference >= 5 && isAiWinning) {
                    updateMessage = `The AI scored. They're ahead by ${scoreDifference} points. The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                } else {
                    updateMessage = `The AI scored. The score is now ${this.gameState.playerScore}-${this.gameState.aiScore}.`;
                }
                break;
                
            case 'score_update':
                updateMessage = `The current score is: You ${this.gameState.playerScore}, AI ${this.gameState.aiScore}.`;
                break;
                
            default:
                return; // Don't send anything for unknown event types
        }
        
        // Format message according to OpenAI's WebRTC API requirements
        const payload = JSON.stringify({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'system',
                content: [{
                    type: 'input_text',
                    text: updateMessage
                }]
            }
        });
        
        this.dataChannel.send(payload);
        console.log(`Game state update sent: ${eventType} - ${updateMessage}`);
        
        // Request a response for certain events
        if (['game_ended', 'player_scored', 'ai_scored'].includes(eventType)) {
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            setTimeout(() => {
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(responsePayload);
                }
            }, 500);
        }
    }
    
    // Update session with custom instructions about the VR Pong game
    updateSessionInstructions() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('Cannot update session instructions: data channel not ready');
            return;
        }
        
        console.log('Updating session with VR Pong game instructions');
        
        // Include current game state in the instructions
        const currentScore = this.gameState.gameInProgress 
            ? `Current score: Player ${this.gameState.playerScore}, AI ${this.gameState.aiScore}.` 
            : 'No game is currently in progress.';
        
        // Custom instructions about the VR Pong game
        const gameInstructions = `
            You are a specialized AI assistant for a VR Pong game. Your primary role is to help players understand and enjoy the game.
            
            Game Rules and Mechanics:
            - This is a 3D virtual reality version of the classic Pong game
            - Players use VR controllers to move paddles and hit a ball back and forth
            - The game can be played in single-player mode against an AI opponent or multiplayer mode against other players
            - Players score points when their opponent misses the ball
            - The game features power-ups that can change ball speed, paddle size, or add special effects
            - Players can customize their paddle appearance and game environment
            
            Game Controls:
            - Move the VR controller to position the paddle
            - The paddle follows the controller's position in 3D space
            - Press trigger buttons for special actions or power-ups
            - Use the menu button to access game settings
            
            Game Modes:
            - Practice Mode: Play against an AI with adjustable difficulty
            - Multiplayer Mode: Play against other players online
            - Tournament Mode: Compete in structured competitions
            
            Current Game State:
            ${currentScore}
            
            As a game commentator and assistant:
            - Provide enthusiastic commentary about the game progress
            - Offer encouragement when the player is behind
            - Congratulate the player on good plays and scoring
            - Provide tips for improvement when appropriate
            - Keep track of the score and mention it in your responses
            - Be concise in your responses during active gameplay
            
            Focus exclusively on answering questions about the game, its rules, controls, strategies, and troubleshooting.
            Be enthusiastic and encouraging to players, especially beginners.
            If asked about topics unrelated to the VR Pong game, politely redirect the conversation back to the game.
            
            You will receive real-time updates about the game state through system messages.
            When you receive these updates, acknowledge them naturally in your responses.
        `;
        
        // Send session update with custom instructions
        const updatePayload = JSON.stringify({
            type: 'session.update',
            session: {
                instructions: gameInstructions,
                modalities: ["audio", "text"],
                voice: "alloy",
                temperature: 0.7
            }
        });
        
        this.dataChannel.send(updatePayload);
        console.log('Session instructions updated for VR Pong game');
    }
}

// Initialize the OpenAI voice assistant when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.openAIVoice = new OpenAIVoiceAssistant();
});