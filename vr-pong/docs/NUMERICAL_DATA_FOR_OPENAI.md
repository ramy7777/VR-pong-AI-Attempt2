# Numerical Data Communication for OpenAI Voice Assistant

## Overview
This document details how numerical data is formatted, communicated, and utilized by the OpenAI Voice Assistant in the VR Pong game. Precise numerical information helps the AI provide accurate and contextually relevant commentary.

## Score Information

### Format
The score is always communicated as two integers in "Player-AI" format:
```javascript
// In game state updates
updatedData = {
    playerScore: 3,  // Integer value
    aiScore: 2       // Integer value
}

// In message text
"The score is now 3-2."
```

### Score Changes
When scores change, we send both the raw numerical values and interpretive context:
```javascript
// Player scores
sendGameStateUpdate('player_scored', {
    playerScore: playerScore,
    aiScore: aiScore,
    message: `Player scored a point! The score is now ${playerScore}-${aiScore}.`
});

// AI scores
sendGameStateUpdate('ai_scored', {
    playerScore: playerScore,
    aiScore: aiScore,
    message: `AI scored a point. The score is now ${playerScore}-${aiScore}.`
});
```

### Score Differential
We calculate and include the score differential to help the AI understand game context:
```javascript
updatedData = {
    // ...other data
    scoreDifferential: playerScore - aiScore,  // Positive when player is ahead
    playerLeading: playerScore > aiScore,
    aiLeading: aiScore > playerScore,
    scoreEqual: playerScore === aiScore
}
```

## Time Values

### Game Duration
Game time is tracked in seconds and formatted appropriately:
```javascript
updatedData = {
    gameTimeElapsed: 127,           // Seconds since game start
    formattedGameTime: "2:07",      // MM:SS format
    gameTimeRemaining: 93,          // Seconds remaining
    formattedTimeRemaining: "1:33"  // MM:SS format
}
```

### Time Thresholds
The AI is informed when specific time thresholds are crossed:
```javascript
// Time warning thresholds (in seconds)
const timerWarningThresholds = [60, 30, 20, 10];  // 1 min, 30 sec, 20 sec, 10 sec

// When threshold is crossed
sendGameStateUpdate('time_announcement', {
    timeRemaining: 60,
    message: "1 minute remaining in the game."
});
```

### Final Countdown
Special numerical formatting for the final countdown:
```javascript
// For final 10 seconds
for (let i = 10; i >= 1; i--) {
    setTimeout(() => {
        sendGameStateUpdate('countdown', {
            secondsLeft: i,
            message: `${i}...`
        });
    }, (10 - i) * 1000);
}
```

## Rally Statistics

### Duration Tracking
Rally durations are tracked with millisecond precision but reported in seconds:
```javascript
updatedData = {
    rallyDuration: 7.42,        // Current rally duration in seconds
    longestRally: 12.81,        // Longest rally so far in seconds
    averageRallyLength: 5.36    // Average rally length in seconds
}
```

### Rally Milestones
Special updates are sent when rallies reach notable durations:
```javascript
// Rally milestone thresholds (in seconds)
const rallyMilestones = [5, 10, 15, 20, 30];

// When milestone is crossed
if (rallyDuration >= 10 && lastRallyMilestone < 10) {
    sendGameStateUpdate('rally_milestone', {
        rallyDuration: Math.round(rallyDuration * 10) / 10, // One decimal place
        message: "Impressive rally! It's been going for 10 seconds now!"
    });
}
```

### Hit Counter
Number of consecutive hits is tracked and communicated:
```javascript
updatedData = {
    hitCounter: 8,          // Current number of paddle hits in this rally
    maxHitCounter: 14       // Maximum number of hits in any rally this game
}
```

## AI Paddle Performance Metrics

### Speed Values
The AI paddle's performance is quantified:
```javascript
updatedData = {
    aiPaddleSpeed: 0.75,            // Current speed as proportion of maximum (0.0-1.0)
    aiPaddleNormalSpeed: 1.0,       // Normal speed value
    aiPaddleSlowdownFactor: 0.25,   // How much the paddle has slowed down
    aiReactionTime: 205             // Current reaction time in milliseconds
}
```

### Difficulty Settings
Numerical representation of game difficulty:
```javascript
updatedData = {
    difficultyLevel: 2,             // 1=Easy, 2=Medium, 3=Hard
    difficultyName: "Medium",       // String representation
    aiAggressiveness: 0.6           // 0.0-1.0 scale of AI aggressiveness
}
```

## Player Performance Metrics

### Hit Accuracy
We track and communicate hit precision:
```javascript
updatedData = {
    playerHitAccuracy: 0.83,        // Proportion of successful returns (0.0-1.0)
    playerMisses: 3,                // Number of misses this game
    playerConsecutiveHits: 6,       // Current streak of successful returns
    playerBestStreak: 9             // Best streak this game
}
```

### Paddle Movement
Movement statistics help contextualize player skill:
```javascript
updatedData = {
    paddleMovementSpeed: 0.68,      // Average movement speed (0.0-1.0)
    paddlePositionVariance: 0.42,   // How much the paddle moves around (0.0-1.0)
    centerDeviation: 0.14           // How often player stays center (lower is better)
}
```

## Best Practices for Numerical Data

### 1. Consistency
- Always use the same format for the same type of data
- Keep units consistent (seconds for time, integers for scores)
- Use fixed decimal precision (typically 1-2 places for most values)

### 2. Context
- Pair raw numbers with context ("3 points ahead" rather than just "3")
- Provide relative values when appropriate ("30% faster than normal")
- Include trend information when available ("increased by 2 since last update")

### 3. Thresholds
- Define clear thresholds for commentary triggers
- Scale commentary intensity with numerical significance
- Avoid commenting on insignificant numerical changes

### 4. Human-Readable Formatting
- Format durations as MM:SS when over 60 seconds
- Use ordinal numbers when appropriate ("3rd point" not "3 point")
- Round decimal values appropriately for verbal communication

## Implementation Examples

### Score Update Example
```javascript
function sendScoreUpdate(playerScore, aiScore) {
    const scoreDiff = playerScore - aiScore;
    let context = "";
    
    if (scoreDiff > 3) context = "Player has a commanding lead!";
    else if (scoreDiff < -3) context = "AI has a commanding lead.";
    else if (scoreDiff > 0) context = "Player is ahead.";
    else if (scoreDiff < 0) context = "AI is ahead.";
    else context = "The game is tied.";
    
    sendGameStateUpdate('score_update', {
        playerScore: playerScore,
        aiScore: aiScore,
        scoreDifferential: scoreDiff,
        context: context,
        message: `The score is ${playerScore}-${aiScore}. ${context}`
    });
}
```

### Time Formatting Example
```javascript
function formatTimeForAI(seconds) {
    if (seconds < 60) {
        return `${seconds} seconds`;
    } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            return `${minutes} minute${minutes > 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
        }
    }
}
```

### Rally Duration Example
```javascript
function announceRallyDuration(durationInSeconds) {
    let intensity = ""; 
    
    if (durationInSeconds > 20) intensity = "Incredible";
    else if (durationInSeconds > 15) intensity = "Amazing";
    else if (durationInSeconds > 10) intensity = "Impressive";
    else if (durationInSeconds > 5) intensity = "Good";
    
    if (intensity) {
        sendGameStateUpdate('rally_duration', {
            rallyDuration: durationInSeconds,
            intensity: intensity,
            message: `${intensity} rally! It's been going for ${durationInSeconds.toFixed(1)} seconds!`
        });
    }
}
``` 