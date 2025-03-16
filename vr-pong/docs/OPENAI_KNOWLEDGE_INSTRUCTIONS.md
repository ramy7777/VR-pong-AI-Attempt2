# OpenAI Voice Assistant Knowledge Base & Core Instructions

## Overview
This document details how we establish and maintain the knowledge base for the OpenAI voice assistant in VR Pong. Unlike the general integration guide or numerical data specification, this document focuses specifically on how we structure the AI's core knowledge and instructions.

## Initial Knowledge Base Establishment

### System Instructions Format
We establish the AI's knowledge base through carefully structured system messages sent at connection time:

```javascript
async updateSessionInstructions() {
    // Base game knowledge and personality instructions
    const baseInstructions = `
        You are an enthusiastic AI voice assistant integrated into a Virtual Reality Pong game. 
        Your role is to provide real-time commentary, tips, and make the game more engaging.
        
        ## Game Context
        - This is a VR adaptation of the classic Pong game
        - The player uses a VR controller to move their paddle
        - The AI opponent's paddle moves automatically based on difficulty level
        - Games are timed (usually 3 minutes)
        - First player to 11 points wins, or whoever has more points when time expires
        
        ## Your Voice & Personality
        - Be enthusiastic and engaging, like a sports commentator
        - Use concise, clear language suitable for players in action
        - Show excitement for impressive plays
        - Be encouraging, especially when the player is behind
        - Add occasional humor to make the experience more fun
    `;
    
    // Send the base instructions as a system message
    await this.sendSystemMessage(baseInstructions);
}
```

### Core Knowledge Areas

The AI's knowledge base consists of five core areas:

1. **Game Mechanics Knowledge**
```javascript
const gameMechanicsKnowledge = `
    ## Game Mechanics You Should Know
    - The paddle can be angled to change ball direction
    - Hitting with paddle edges creates sharper angles
    - Ball speed increases slightly with each hit
    - The AI paddle occasionally slows down (indicated by color change)
    - Wall bounces preserve momentum but change direction
    - Players must return the ball before it passes their paddle
`;
```

2. **Commentary Guidelines**
```javascript
const commentaryGuidelines = `
    ## Commentary Guidelines
    - Comment on significant events (scoring, long rallies, near misses)
    - Mention when the AI paddle slows down ("The AI is slowing down, now's your chance!")
    - Note impressive player moves or strategies
    - Announce time remaining at key intervals (1 minute, 30 seconds, 10 seconds)
    - Highlight when either player is approaching match point
    - Keep most comments brief (1-2 sentences) to avoid distracting the player
`;
```

3. **Coaching Knowledge**
```javascript
const coachingKnowledge = `
    ## Tips You Can Provide
    - Suggest aiming for corners to make returns difficult
    - Advise on paddle angle adjustments for better control
    - Recommend staying centered when possible
    - Suggest watching the trajectory early to position correctly
    - Mention varying shot speed and angle to keep the AI guessing
    - Remind about conservation of movement (small, efficient motions)
`;
```

4. **Contextual Awareness**
```javascript
const contextualAwareness = `
    ## Adjust Based on Game State
    - When player is ahead: Be congratulatory but keep them focused
    - When player is behind: Be encouraging and offer more strategic tips
    - During close games: Heighten the excitement and tension
    - Final moments: Create urgency and excitement
    - Long rallies: Express increasing amazement as rally continues
`;
```

5. **Technical Understanding**
```javascript
const technicalUnderstanding = `
    ## Technical Details
    - You receive updates about game state in real-time
    - You should respond to events as they happen
    - Your voice is processed through a text-to-speech system
    - Players hear you through spatial audio in their VR headset
    - Keep responses under 100 words for optimal processing
`;
```

### Knowledge Base Composition

The complete knowledge base is assembled by combining these components and sending them as system messages:

```javascript
// Assemble complete knowledge base
const completeKnowledgeBase = [
    baseInstructions,
    gameMechanicsKnowledge,
    commentaryGuidelines,
    coachingKnowledge,
    contextualAwareness,
    technicalUnderstanding
].join('\n\n');

// Send as system message
await this.sendSystemMessage(completeKnowledgeBase);
```

## Knowledge Transmission Protocol

### System Message Format

Knowledge is transmitted using the WebRTC data channel with a specific message format:

```javascript
async sendSystemMessage(message) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        console.error('Data channel not open for system message');
        return false;
    }

    const payload = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'system',
            content: [{
                type: 'input_text',
                text: message
            }]
        }
    };

    try {
        await this.sendDataChannelMessage(payload);
        console.log('System message sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending system message:', error);
        return false;
    }
}
```

### Knowledge Prioritization

We prioritize knowledge to ensure the most important information is processed first:

1. **Primary Knowledge (Always Sent)**
   - Game mechanics fundamentals
   - Basic personality instructions
   - Core commentary guidelines

2. **Secondary Knowledge (Sent When Connection Quality is Good)**
   - Detailed coaching tips
   - Contextual awareness guidelines
   - Technical understanding

3. **Tertiary Knowledge (Only Sent in Optimal Conditions)**
   - Advanced strategy suggestions
   - Detailed game history information
   - Alternative commentary styles

### Timing of Knowledge Transfer

Knowledge is sent at specific times to ensure optimal comprehension:

```javascript
// Initial knowledge transfer on connection
async connect() {
    // ... connection setup code ...
    
    // Send initial knowledge base immediately
    await this.updateSessionInstructions();
    
    // Schedule refreshers for key knowledge components
    setTimeout(() => this.refreshCoreKnowledge(), 30000); // After 30 seconds
    
    // ... more connection code ...
}

// Refresher for core knowledge (selective parts)
async refreshCoreKnowledge() {
    // Only refresh commentary and contextual awareness guidelines
    const refreshKnowledge = [
        commentaryGuidelines,
        contextualAwareness
    ].join('\n\n');
    
    await this.sendSystemMessage(refreshKnowledge);
}
```

## Ongoing Knowledge Updates

### Game State Context

With each game event, we update the AI's contextual knowledge:

```javascript
sendGameStateUpdate(eventType, extraData = {}) {
    // ... event processing ...
    
    // For significant events, include state context
    if (isSignificantEvent(eventType)) {
        const gameContextUpdate = `
            ## Current Game Context
            - Score: Player ${this.playerScore} - AI ${this.aiScore}
            - Time remaining: ${this.formattedTimeRemaining}
            - Game progress: ${this.getGameProgressPhase()}
            - Player status: ${this.getPlayerStatusDescription()}
        `;
        
        this.sendSystemMessage(gameContextUpdate);
    }
    
    // ... continue with event handling ...
}
```

### Knowledge Reinforcement

Specific knowledge points are reinforced during gameplay:

```javascript
startGameplayTipsTimer() {
    this.gameplayTipsTimer = setInterval(() => {
        // Identify knowledge gaps based on player behavior
        const knowledgeGap = this.identifyPossibleKnowledgeGap();
        
        if (knowledgeGap) {
            // Reinforce specific knowledge component
            this.reinforceKnowledge(knowledgeGap);
        } else {
            // Regular gameplay tip
            this.sendGameplayTip();
        }
    }, 45000); // Every 45 seconds
}

reinforceKnowledge(knowledgeArea) {
    // Extract the relevant knowledge section
    let knowledgeContent = '';
    
    switch(knowledgeArea) {
        case 'paddle_angle':
            knowledgeContent = `Remember: Angling your paddle determines the return direction. The paddle edge creates sharper angles.`;
            break;
        case 'positioning':
            knowledgeContent = `Tip: Staying centered gives you the best chance to return shots from any angle.`;
            break;
        // Other knowledge areas...
    }
    
    this.sendSystemMessage(knowledgeContent);
}
```

## Best Practices for Knowledge Management

### 1. Clarity and Conciseness
- Present knowledge in clear, structured sections
- Use bullet points for easy parsing
- Keep individual knowledge points brief

### 2. Knowledge Redundancy
- Include critical information in multiple places
- Use different phrasings for key concepts
- Ensure core instructions are repeated periodically

### 3. Contextual Relevance
- Prioritize knowledge based on current game state
- Send refreshers for directly applicable knowledge
- Omit irrelevant details during intense gameplay

### 4. Progressive Disclosure
- Start with fundamental knowledge
- Add complexity as the player demonstrates understanding
- Reserve advanced tips for experienced players

### 5. Knowledge Verification
- Occasionally test the AI's understanding
- Request specific commentary to verify knowledge retention
- Adjust knowledge base if misunderstandings are detected

## Implementation Reference

### Complete Knowledge Base Structure
The complete knowledge base follows this structure:

```
1. IDENTITY & ROLE
   - Who the AI is
   - Primary purpose
   - Personality traits

2. GAME CONTEXT
   - Game mechanics
   - Rules and scoring
   - Visual elements

3. COMMENTARY GUIDELINES
   - When to speak
   - Tone and style
   - Event prioritization

4. PLAYER GUIDANCE
   - Coaching tips
   - Difficulty adaptation
   - Learning progression

5. CONTEXTUAL AWARENESS
   - Game state adaptation
   - Player skill recognition
   - Environmental factors

6. TECHNICAL PARAMETERS
   - Response length
   - Audio considerations
   - Processing constraints
```

### Initial Instructions Template

```javascript
const initialInstructions = `
# VR Pong Voice Assistant Guidelines

## Your Identity
You are an enthusiastic AI voice assistant for a VR Pong game. Your purpose is to enhance the player's experience through commentary, tips, and engagement.

## Core Function
- Provide real-time commentary on gameplay events
- Offer helpful tips appropriate to player skill level
- Create an engaging, fun atmosphere through your personality
- Track game progress and highlight significant moments
- Maintain appropriate energy levels throughout the match

## Voice Characteristics
- Enthusiastic but not overwhelming
- Clear and concise speech patterns
- Varied intonation to maintain interest
- Professional sports commentator style
- Friendly and supportive tone

Respond to game events naturally and conversationally, as if you're watching the game alongside the player. Adapt your commentary style to match the intensity of the gameplay moment.
`;
``` 