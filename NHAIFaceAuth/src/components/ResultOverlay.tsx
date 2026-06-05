/**
 * NHAI FaceAuth — ResultOverlay
 *
 * Full-screen modal overlay displayed immediately upon completion of the
 * authentication pipeline.
 * Features:
 *   - Glassmorphism overlay card with blur/shadow aesthetics
 *   - Success: Large green checkmark, employee name, match confidence, and greeting
 *   - Failure: Large red cross, failure reason details, and actionable Retry/Close options
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import type { AuthenticationResult } from '../types';
import { COLORS } from '../../App';

interface ResultOverlayProps {
  result: AuthenticationResult | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  onRetry,
  onDismiss,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (result) {
      // Run card pop-up animation
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();

      // Automatically dismiss on success after 3.5 seconds
      if (result.success) {
        const timer = setTimeout(() => {
          onDismiss();
        }, 3500);
        return () => clearTimeout(timer);
      }
    } else {
      // Fade out
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.7,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [result]);

  if (!result) return null;

  const { success, userName, matchConfidence, failureReason, processingTimeMs } = result;

  // Map failure reason to user-friendly Indian demographic error description
  let failureTitle = 'Authentication Failed';
  let failureDesc = 'Please try again.';

  if (failureReason) {
    switch (failureReason) {
      case 'NO_FACE_DETECTED':
        failureTitle = 'No Face Detected';
        failureDesc = 'Position your face within the camera viewport.';
        break;
      case 'MULTIPLE_FACES':
        failureTitle = 'Multiple Faces';
        failureDesc = 'Ensure only one person is in front of the camera.';
        break;
      case 'LIVENESS_FAILED':
        failureTitle = 'Liveness Check Failed';
        failureDesc = 'Perform the screen challenges exactly as requested.';
        break;
      case 'SPOOF_DETECTED':
        failureTitle = 'Spoofing Attack Blocked';
        failureDesc = 'Anti-spoofing algorithm flagged a non-live presentation (photo/screen).';
        break;
      case 'NO_MATCH':
        failureTitle = 'Face Not Recognized';
        failureDesc = 'The captured face does not match any enrolled personnel database record.';
        break;
      case 'LOW_CONFIDENCE':
        failureTitle = 'Low Match Confidence';
        failureDesc = 'Position yourself in better lighting and look directly into the camera.';
        break;
      case 'CHALLENGE_TIMEOUT':
        failureTitle = 'Session Timeout';
        failureDesc = 'Completed challenges too slowly. Please respond to prompts promptly.';
        break;
      case 'DEVICE_LOCKED':
        failureTitle = 'Device Locked Out';
        failureDesc = 'Too many failed authentication attempts. Contact your NHAI supervisor.';
        break;
      case 'FACE_QUALITY_POOR':
        failureTitle = 'Poor Image Quality';
        failureDesc = 'Clean the camera lens, stand still, and avoid extreme backlighting.';
        break;
      default:
        failureTitle = 'System Error';
        failureDesc = `Pipeline aborted: ${failureReason}`;
    }
  }

  return (
    <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        {success ? (
          /* SUCCESS STATE */
          <View style={styles.content}>
            <View style={[styles.statusRing, styles.successRing]}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
            <Text style={styles.welcomeText}>WELCOME</Text>
            <Text style={styles.nameText}>{userName}</Text>
            
            <View style={styles.divider} />
            
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Match Confidence</Text>
              <Text style={[styles.metaVal, styles.successVal]}>
                {(matchConfidence * 100).toFixed(1)}%
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Speed</Text>
              <Text style={styles.metaVal}>{processingTimeMs} ms</Text>
            </View>

            <Text style={styles.autoDismissHint}>Auto-redirecting in a moment...</Text>
          </View>
        ) : (
          /* FAILURE STATE */
          <View style={styles.content}>
            <View style={[styles.statusRing, styles.failureRing]}>
              <Text style={styles.cross}>✗</Text>
            </View>
            <Text style={styles.errorTitle}>{failureTitle}</Text>
            <Text style={styles.errorDesc}>{failureDesc}</Text>
            
            <View style={styles.divider} />

            {matchConfidence > 0 && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Match Confidence</Text>
                <Text style={[styles.metaVal, styles.failVal]}>
                  {(matchConfidence * 100).toFixed(1)}%
                </Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Speed</Text>
              <Text style={styles.metaVal}>{processingTimeMs} ms</Text>
            </View>

            <View style={styles.actionsContainer}>
              <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 7, 14, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  card: {
    width: '85%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    // Premium Drop Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.58,
    shadowRadius: 16.0,
    elevation: 24,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  statusRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
  },
  successRing: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  failureRing: {
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  checkmark: {
    fontSize: 44,
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  cross: {
    fontSize: 44,
    color: COLORS.danger,
    fontWeight: 'bold',
  },
  welcomeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 6,
  },
  nameText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metaLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  metaVal: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  successVal: {
    color: COLORS.accent,
  },
  failVal: {
    color: COLORS.danger,
  },
  autoDismissHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 25,
    opacity: 0.6,
  },
  actionsContainer: {
    width: '100%',
    marginTop: 25,
    gap: 12,
  },
  retryButton: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderColor: COLORS.border,
    borderWidth: 1.5,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
});
