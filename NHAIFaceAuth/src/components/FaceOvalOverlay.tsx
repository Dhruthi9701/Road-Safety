/**
 * NHAI FaceAuth — FaceOvalOverlay
 *
 * SVG-based overlay masking the screen with a semi-transparent dark backdrop
 * and leaving a clear oval guide in the center.
 * Features:
 *   - Oval border color shifts dynamically (Green: Aligned, Yellow: Warning/Adjust, Red: No face)
 *   - Corner scanning reticle animation
 *   - Pulsing border animation when active liveness checks are running
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Defs, Mask, Rect, Ellipse } from 'react-native-svg';
import type { FaceGuideState } from '../types';
import { COLORS } from '../../App';

interface FaceOvalOverlayProps {
  guideState: FaceGuideState;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Calculate oval parameters dynamically based on screen dimensions
const OVAL_WIDTH = SCREEN_WIDTH * 0.72;
const OVAL_HEIGHT = OVAL_WIDTH / 0.75; // 0.75 Aspect Ratio (width/height)
const CX = SCREEN_WIDTH / 2;
const CY = SCREEN_HEIGHT * 0.42; // Positioned slightly above center for better hand ergonomics

export const FaceOvalOverlay: React.FC<FaceOvalOverlayProps> = ({ guideState }) => {
  const borderPulse = useRef(new Animated.Value(1)).current;
  const scanLineY = useRef(new Animated.Value(CY - OVAL_HEIGHT / 2)).current;

  // Set color mapping based on guidance state
  let borderColor = COLORS.danger;
  if (guideState.guidanceColor === 'green') {
    borderColor = COLORS.accent;
  } else if (guideState.guidanceColor === 'yellow') {
    borderColor = COLORS.warning;
  }

  // Border pulsing animation when user is completing active liveness challenges
  useEffect(() => {
    if (guideState.showOval) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulse, {
            toValue: 1.15,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(borderPulse, {
            toValue: 1.0,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      borderPulse.setValue(1.0);
    }
  }, [guideState.showOval]);

  // Scanline laser animation running loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, {
          toValue: CY + OVAL_HEIGHT / 2,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineY, {
          toValue: CY - OVAL_HEIGHT / 2,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* SVG Mask Backdrop */}
      <Svg style={StyleSheet.absoluteFillObject}>
        <Defs>
          <Mask id="mask">
            {/* White covers the entire screen, making it opaque in the mask */}
            <Rect width="100%" height="100%" fill="#FFFFFF" />
            {/* Black cuts out the oval shape, making it transparent */}
            <Ellipse
              cx={CX}
              cy={CY}
              rx={OVAL_WIDTH / 2}
              ry={OVAL_HEIGHT / 2}
              fill="#000000"
            />
          </Mask>
        </Defs>
        {/* Render backdrop using mask */}
        <Rect
          width="100%"
          height="100%"
          fill="rgba(5, 7, 14, 0.72)"
          mask="url(#mask)"
        />
      </Svg>

      {/* Styled Oval Border */}
      <View style={styles.borderContainer}>
        <Animated.View
          style={[
            styles.ovalBorder,
            {
              borderColor: borderColor,
              transform: [{ scale: borderPulse }],
            },
          ]}
        />
      </View>

      {/* Scanning laser line overlay */}
      {guideState.faceAligned && (
        <Animated.View
          style={[
            styles.scanLaser,
            {
              transform: [{ translateY: scanLineY }],
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  borderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ovalBorder: {
    position: 'absolute',
    top: CY - OVAL_HEIGHT / 2,
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: Math.max(OVAL_WIDTH, OVAL_HEIGHT) / 2, // approximation for ellipse border
    borderWidth: 3,
    borderStyle: 'solid',
    // Apply subtle drop shadow around the guide
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  scanLaser: {
    position: 'absolute',
    left: CX - OVAL_WIDTH / 2 + 10,
    width: OVAL_WIDTH - 20,
    height: 2,
    backgroundColor: COLORS.primary,
    // Intense glow effect
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
});
