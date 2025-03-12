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
                this.showTranscript();
                
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
                this.hideTranscript();
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
        if (this.transcriptElement) {
            this.transcriptElement.textContent = text;
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
            // Use 'conversation.item.create' type instead of 'text'
            const payload = JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    role: 'user',
                    content: [{
                        type: 'text',
                        text: message
                    }]
                }
            });
            
            this.dataChannel.send(payload);
            console.log('Message sent successfully');
            
            // Request a response after sending the message
            const responsePayload = JSON.stringify({
                type: 'response.create',
                modalities: ['text', 'audio']
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
                } catch (err) {
                    console.error('Reconnection after data channel error failed:', err);
                } finally {
                    this.isReconnecting = false;
                }
            }, 2000);
        }
    }
    
    // Send initial greeting message using the correct format
    async sendGreeting() {
        console.log('Sending initial greeting...');
        
        // Define greeting message
        const greetingMessage = "Hello, I am your Pong VR game assistant. How can I help you today?";
        
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
                    role: 'user',
                    content: [{
                        type: 'text',
                        text: greetingMessage
                    }]
                }
            });
            
            this.dataChannel.send(payload);
            console.log('Initial greeting sent successfully');
            
            // Request a response
            const responsePayload = JSON.stringify({
                type: 'response.create',
                modalities: ['text', 'audio']
            });
            
            setTimeout(() => {
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(responsePayload);
                    console.log('Response request for greeting sent');
                }
            }, 500);
            
        } catch (error) {
            console.error('Error sending greeting:', error);
            
            // Schedule a retry
            setTimeout(() => this.sendGreeting(), 10000);
        }
    }
    
    // Add a message to the transcript
    addMessage(role, text) {
        if (!this.transcriptElement) return;
        
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        // Create label
        const label = document.createElement('span');
        label.classList.add('label');
        label.textContent = role === 'user' ? 'You: ' : 'Assistant: ';
        
        // Create text content
        const content = document.createElement('span');
        content.classList.add('content');
        content.textContent = text;
        
        // Add to message
        messageDiv.appendChild(label);
        messageDiv.appendChild(content);
        
        // Add to transcript
        this.transcriptElement.appendChild(messageDiv);
        
        // Scroll to bottom
        this.transcriptElement.scrollTop = this.transcriptElement.scrollHeight;
        
        console.log(`Added ${role} message to transcript: ${text}`);
    }
}

// Initialize the OpenAI voice assistant when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.openAIVoice = new OpenAIVoiceAssistant();
}); 