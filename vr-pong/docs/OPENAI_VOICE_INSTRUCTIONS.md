# OpenAI Voice Assistant Integration Guide

## Overview
This document explains how we integrate OpenAI's voice assistant into the VR Pong game, focusing on how we provide game context and instructions to the AI.

## Initial Setup and Instructions

### 1. Session Initialization
When the voice assistant connects, we initialize it with basic game context through the `updateSessionInstructions()` method. This provides the AI with fundamental information about its role and capabilities.

### 2. Core Instructions
The AI receives these core instructions when the session is created:
```javascript
You are an enthusiastic AI voice assistant integrated into a Virtual Reality Pong game. Your role is to provide real-time commentary, tips, and make the game more engaging.

Your capabilities in this VR Pong game:
1. Provide real-time commentary on game events (rallies, scores, near misses)
2. Offer strategic tips when appropriate
3. Comment on the AI's occasional slowdowns when they happen
4. Make remarks about long rallies and their duration
5. Announce important time remaining milestones (1 minute left, 30 seconds, etc.)
6. Add humor and personality to make the game more fun
```

## Real-time Game State Updates

### 1. Game Events
The AI receives updates for various game events through the `sendGameStateUpdate()` method:

- **Game Start**: 
  ```javascript
  "Game has started! The player is facing off against the AI in a virtual reality Pong match."
  ```

- **Scoring Events**:
  ```javascript
  "Player scored a point! The score is now X-Y."
  "AI scored a point. The score is now X-Y."
  ```

- **Rally Events**:
  ```javascript
  "Player hit the ball with their paddle. Rally has been going for X seconds."
  "The ball hit a wall boundary. Current rally: X seconds."
  ```

- **AI State Changes**:
  ```javascript
  "The AI paddle is temporarily slowing down. Player has an advantage for a few seconds."
  "The AI paddle has returned to normal speed."
  ```

### 2. Timer Updates
The AI receives time-related updates:
- Regular time announcements (e.g., "1 minute remaining")
- Final countdown updates (e.g., "Final 10 seconds countdown starting!")
- Game end announcements with final scores and match duration

## Dynamic Game State Context

### 1. Current Game State
Before each update, the AI receives the current game state including:
- Game active status
- Current score
- Game status (winning/losing/tied)
- Time remaining
- Rally duration
- AI paddle state

### 2. Contextual Tips
The AI provides different types of tips based on the game state:

- **When Player is Behind**:
  ```javascript
  [
    "Try angling your shots",
    "Aim for the corners",
    "Vary your serve speed",
    "Watch your paddle angle",
    "Stay centered more"
  ]
  ```

- **When Player is Ahead**:
  ```javascript
  [
    "Keep up the good work",
    "Stay focused",
    "Don't get overconfident",
    "Maintain your rhythm"
  ]
  ```

- **During Tied Games**:
  ```javascript
  [
    "Control paddle angle carefully",
    "Stay balanced and ready",
    "Watch ball trajectory",
    "Conserve energy between points"
  ]
  ```

## Message Format

### 1. System Messages
System messages use the 'input_text' content type:
```javascript
{
    type: 'conversation.item.create',
    item: {
        type: 'message',
        role: 'system',
        content: [{
            type: 'input_text',
            text: message
        }]
    }
}
```

### 2. Response Requests
After sending updates, we request AI responses:
```javascript
{
    type: 'response.create'
}
```

## Timing and Frequency

### 1. Regular Updates
- Gameplay tips are sent every 30-60 seconds
- Time announcements occur at specific thresholds (60s, 30s, 20s, 10s)
- Rally updates are sent randomly during gameplay (30% chance for paddle hits, 10% for wall hits)

### 2. Conditional Updates
- Tips are more frequent when the player is behind (90% chance)
- Tips are less frequent when the player is ahead (50% chance)
- No tips are sent during the first 15 seconds of gameplay

## Best Practices

1. **Keep Messages Brief**: All messages are kept short (1-2 sentences) to avoid interrupting gameplay
2. **Contextual Awareness**: Messages are tailored to the current game state
3. **Natural Flow**: Updates are sent with appropriate timing to maintain natural conversation
4. **Error Handling**: Failed messages are queued and retried with exponential backoff
5. **Connection Management**: The system automatically handles reconnection and state recovery

## Implementation Notes

The voice assistant integration is implemented in `openai-voice.js` with these key components:
- `OpenAIVoiceAssistant` class for managing the connection
- `sendGameStateUpdate()` for sending game events
- `updateSessionInstructions()` for updating AI context
- `sendGameplayTip()` for providing strategic advice
- `announceTimeRemaining()` for time-related updates 