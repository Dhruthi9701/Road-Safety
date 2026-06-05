"""
NHAI FaceAuth — Model Export Pipeline

Converts trained TensorFlow SavedModels or Keras H5 models to standard
non-quantized Float32 TFLite files.
This is the preliminary step before running post-training quantization.
"""

import os
import tensorflow as tf

def export_to_tflite_fp32(saved_model_dir, output_tflite_path):
    """
    Converts SavedModel directories to Float32 TFLite.
    """
    print(f"\nConverting SavedModel {saved_model_dir} to Float32 TFLite...")
    
    if not os.path.exists(saved_model_dir):
        print(f"Error: SavedModel directory {saved_model_dir} does not exist.")
        return False
        
    try:
        converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
        tflite_model = converter.convert()
        
        os.makedirs(os.path.dirname(output_tflite_path), exist_ok=True)
        with open(output_tflite_path, 'wb') as f:
            f.write(tflite_model)
            
        print(f"Exported successfully to: {output_tflite_path}")
        print(f"File Size: {os.path.getsize(output_tflite_path) / (1024 * 1024):.2f} MB")
        return True
    except Exception as e:
        print(f"Failed to export TFLite model: {e}")
        return False

if __name__ == '__main__':
    # Export recognition model
    export_to_tflite_fp32(
        saved_model_dir='models/mobilefacenet_fp32.savedmodel',
        output_tflite_path='../NHAIFaceAuth/assets/models/mobilefacenet_fp32.tflite'
    )
    
    # Export anti-spoof model
    export_to_tflite_fp32(
        saved_model_dir='models/antispoof_fp32.savedmodel',
        output_tflite_path='../NHAIFaceAuth/assets/models/antispoof_mobilenetv2_fp32.tflite'
    )
