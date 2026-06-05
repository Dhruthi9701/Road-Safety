/**
 * NHAI FaceAuth — ChallengeProgress
 *
 * SVG circular progress countdown timer used during active liveness challenges.
 * Shows progress towards completion, an representative icon for the current challenge,
 * and a remaining seconds countdown.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ChallengeType } from '../types';
import { COLORS } from '../../App';

interface ChallengeProgressProps {
  progress: number; // 0 to 1 progress of the current challenge detection (e.g. smile hold)
  challengeType: ChallengeType | null;
  timeoutMs: number; // remaining timeout in ms
}

const RADIUS = 42;
const STROKE_WIDTH = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ChallengeProgress: React.FC<ChallengeProgressProps> = ({
  progress,
  challengeType,
  timeoutMs,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.ceil(timeoutMs / 1000)));
  }, [timeoutMs]);

  if (!challengeType) {
    return null;
  }

  // Map challenge types to representative emojis/symbols
  let challengeIcon = '👤';
  let challengeLabel = '';

  switch (challengeType) {
    case 'BLINK':
      challengeIcon = '👁️';
      challengeLabel = 'Blink!';
      break;
    case 'SMILE':
      challengeIcon = '😊';
      challengeLabel = 'Smile!';
      break;
    case 'HEAD_TURN_LEFT':
      challengeIcon = '👈';
      challengeLabel = 'Turn Left';
      break;
    case 'HEAD_TURN_RIGHT':
      challengeIcon = '👉';
      challengeLabel = 'Turn Right';
      break;
    case 'NOD':
      challengeIcon = '👍';
      challengeLabel = 'Nod Head';
      break;
  }

  // Draw circular progress outline. If progress is 0, we can show a countdown outline based on timer
  // progress indicates completion of holding/repeating the action (e.g., holding a smile).
  // Let's draw the circle offset based on the challenge detection progress (how close we are to winning).
  const strokeDashoffset = CIRCUMFERENCE - progress * CIRCUMFERENCE;

  return (
    <View style={styles.container}>
      <View style={styles.circularProgressContainer}>
        <Svg width={(RADIUS + STROKE_WIDTH) * 2} height={(RADIUS + STROKE_WIDTH) * 2} style={styles.svg}>
          {/* Background circle track */}
          <Circle
            cx={RADIUS + STROKE_WIDTH}
            cy={RADIUS + STROKE_WIDTH}
            r={RADIUS}
            stroke="#1E293B"
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
          />
          {/* Active progress track */}
          <Circle
            cx={RADIUS + STROKE_WIDTH}
            cy={RADIUS + STROKE_WIDTH}
            r={RADIUS}
            stroke={COLORS.primary}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            transform={`rotate(-90 ${RADIUS + STROKE_WIDTH} ${RADIUS + STROKE_WIDTH})`}
          />
        </Svg>
        <View style={styles.centerTextContainer}>
          <Text style={styles.icon}>{challengeIcon}</Text>
          <Text style={styles.timerText}>{secondsLeft}s</Text>
        </View>
      </View>
      <Text style={styles.label}>{challengeLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  circularProgressContainer: {
    width: (RADIUS + STROKE_WIDTH) * 2,
    height: (RADIUS + STROKE_WIDTH) * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  centerTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 28,
  },
  timerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  label: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
