/**
 * NHAI FaceAuth — FeedbackText
 *
 * Renders real-time guidance and instruction messages directly under the face oval.
 * Features:
 *   - Fade-in/out transitions when the feedback text updates
 *   - Semantic color coding based on the current pipeline state (Green = Success/Good, Yellow = Warn/Instruction, Red = Error/Locked)
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Animated } from 'react-native';
import type { PipelineState } from '../types';
import { COLORS } from '../../App';

interface FeedbackTextProps {
  text: string;
  state: PipelineState;
}

export const FeedbackText: React.FC<FeedbackTextProps> = ({ text, state }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [displayText, setDisplayText] = useState(text);

  // Trigger cross-fade animation when instruction text changes
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(50),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Change displayed text during the opacity transition
    const timeout = setTimeout(() => {
      setDisplayText(text);
    }, 150);

    return () => clearTimeout(timeout);
  }, [text]);

  // Determine text color based on state
  let textColor = COLORS.text;
  if (state === 'RESULT_SUCCESS') {
    textColor = COLORS.accent;
  } else if (state === 'RESULT_FAILURE' || state === 'LOCKED_OUT' || state === 'ERROR') {
    textColor = COLORS.danger;
  } else if (state === 'LIVENESS_CHECK') {
    textColor = COLORS.primary;
  } else if (state === 'VALIDATING_FACE') {
    textColor = COLORS.warning;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Text style={[styles.feedbackText, { color: textColor }]}>
        {displayText}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    minHeight: 60,
  },
  feedbackText: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 4,
  },
});
