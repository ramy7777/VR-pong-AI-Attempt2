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
        
        // API format tracking
        this.contentType = 'text'; // Start with 'text' and switch if needed
        this.lastContentTypeError = null;
        
        // Rate limiting and connection health
        this.lastMessageTime = 0;
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
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
            
            // Request API key from user only if we don't have one
            if (!this.apiKey) {
                const apiKeyInput = prompt('Please enter your OpenAI API Key:', '');
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
        
        // Define greeting message with game-specific content - simplified for brevity
        const greetingMessage = "Ready";
        
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
    
    // Send real-time game state updates to OpenAI
    sendGameStateUpdate(eventType) {
        if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('Cannot send game state update: not connected');
            return;
        }
        
        let updateMessage = '';
        
        switch (eventType) {
            case 'game_started':
                updateMessage = "Game started";
                break;
                
            case 'game_ended':
                if (this.gameState.playerScore > this.gameState.aiScore) {
                    updateMessage = `Player won ${this.gameState.playerScore}-${this.gameState.aiScore}`;
                } else if (this.gameState.aiScore > this.gameState.playerScore) {
                    updateMessage = `AI won ${this.gameState.aiScore}-${this.gameState.playerScore}`;
                } else {
                    updateMessage = `Tie ${this.gameState.playerScore}-${this.gameState.aiScore}`;
                }
                break;
                
            case 'player_scored':
                updateMessage = `Player scored ${this.gameState.playerScore}-${this.gameState.aiScore}`;
                break;
                
            case 'ai_scored':
                updateMessage = `AI scored ${this.gameState.playerScore}-${this.gameState.aiScore}`;
                break;
                
            default:
                return; // Don't send anything for unknown event types
        }
        
        try {
            // Update UI
            this.updateStatus(`Game update: ${updateMessage}`);
            this.addMessage('system', updateMessage);
            
            // Format message according to OpenAI's WebRTC API requirements
            // System messages use 'input_text' type (confirmed from error messages)
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
            
            // Use the rate-limited message sender instead of direct send
            this.sendDataChannelMessage(payload);
            console.log(`Game state update sent: ${eventType} - ${updateMessage}`);
            
            // Request a response for all game events
            const responsePayload = JSON.stringify({
                type: 'response.create'
            });
            
            setTimeout(() => {
                this.sendDataChannelMessage(responsePayload);
            }, 500);
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
        
        console.log('Updating session with VR Pong game instructions');
        
        // Include current game state in the instructions
        const currentScore = this.gameState.gameInProgress 
            ? `${this.gameState.playerScore}-${this.gameState.aiScore}` 
            : 'No game';
        
        // Custom instructions about the VR Pong game - extremely simplified for brevity
        const gameInstructions = `
            You are a VR Pong game assistant. Be extremely brief.
            
            CRITICAL RULES:
            - Use 2 words or less for ALL responses
            - Never use more than 2 words total
            - No complete sentences
            - No greetings or pleasantries
            - Only essential gameplay tips
            - No punctuation
            - No articles (a, an, the)
            
            Current score: ${currentScore}
        `;
        
        try {
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
}

// Initialize the OpenAI voice assistant when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.openAIVoice = new OpenAIVoiceAssistant();
});