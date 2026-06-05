/**
 * NHAI FaceAuth — Model File Validator
 *
 * Validates that all required TFLite models exist, have correct sizes,
 * and can be loaded successfully. Critical for pre-submission validation.
 */

import RNFS from 'react-native-fs';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import { Platform } from 'react-native';

export interface ModelSpec {
  name: string;
  path: string;
  expectedSize: number; // bytes
  maxSize: number; // bytes
  quantization: 'INT8' | 'FLOAT32';
  inputShape: number[];
  outputShape: number[];
}

export interface ModelValidationResult {
  modelName: string;
  exists: boolean;
  actualSize: number;
  withinSizeLimit: boolean;
  loadable: boolean;
  errors: string[];
}

export interface ValidationReport {
  allValid: boolean;
  totalSize: number;
  models: ModelValidationResult[];
  errors: string[];
  warnings: string[];
  timestamp: string;
}

/**
 * TFLite Model Validator
 */
export class ModelValidator {
  private static readonly MODEL_SPECS: ModelSpec[] = [
    {
      name: 'BlazeFace',
      path: 'assets/models/blazeface.tflite',
      expectedSize: 200 * 1024, // 200KB
      maxSize: 250 * 1024,
      quantization: 'INT8',
      inputShape: [1, 128, 128, 3],
      outputShape: [1, 896, 16],
    },
    {
      name: 'FaceMesh',
      path: 'assets/models/facemesh.tflite',
      expectedSize: 2.5 * 1024 * 1024, // 2.5MB
      maxSize: 3 * 1024 * 1024,
      quantization: 'INT8',
      inputShape: [1, 192, 192, 3],
      outputShape: [1, 468, 3],
    },
    {
      name: 'MobileNetV2 AntiSpoof',
      path: 'assets/models/antispoof.tflite',
      expectedSize: 3.5 * 1024 * 1024, // 3.5MB
      maxSize: 4 * 1024 * 1024,
      quantization: 'INT8',
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 2],
    },
    {
      name: 'MobileFaceNet',
      path: 'assets/models/mobilefacenet.tflite',
      expectedSize: 1.0 * 1024 * 1024, // 1.0MB
      maxSize: 1.5 * 1024 * 1024,
      quantization: 'INT8',
      inputShape: [1, 112, 112, 3],
      outputShape: [1, 128],
    },
  ];

  /**
   * Maximum total model bundle size (7.2MB target, 8MB hard limit)
   */
  private static readonly MAX_TOTAL_SIZE = 8 * 1024 * 1024; // 8MB
  private static readonly TARGET_TOTAL_SIZE = 7.2 * 1024 * 1024; // 7.2MB

  /**
   * Validate all models and generate comprehensive report
   */
  static async validateAllModels(): Promise<ValidationReport> {
    const report: ValidationReport = {
      allValid: true,
      totalSize: 0,
      models: [],
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    };

    console.log('[ModelValidator] Starting validation of 4 TFLite models...');

    // Validate each model
    for (const spec of this.MODEL_SPECS) {
      const result = await this.validateModel(spec);
      report.models.push(result);

      if (result.exists && result.actualSize > 0) {
        report.totalSize += result.actualSize;
      }

      // Collect errors
      if (result.errors.length > 0) {
        report.allValid = false;
        report.errors.push(...result.errors.map(err => `[${spec.name}] ${err}`));
      }
    }

    // Validate total size
    if (report.totalSize > this.MAX_TOTAL_SIZE) {
      report.allValid = false;
      report.errors.push(
        `Total model size ${this.formatBytes(report.totalSize)} exceeds hard limit ${this.formatBytes(this.MAX_TOTAL_SIZE)}`,
      );
    } else if (report.totalSize > this.TARGET_TOTAL_SIZE) {
      report.warnings.push(
        `Total model size ${this.formatBytes(report.totalSize)} exceeds target ${this.formatBytes(this.TARGET_TOTAL_SIZE)} (within limit but not optimal)`,
      );
    }

    // Summary
    const validCount = report.models.filter(m => m.exists && m.loadable && m.withinSizeLimit).length;
    console.log(
      `[ModelValidator] Validation complete: ${validCount}/${this.MODEL_SPECS.length} models valid`,
    );
    console.log(`[ModelValidator] Total model bundle size: ${this.formatBytes(report.totalSize)}`);

    return report;
  }

  /**
   * Validate a single model
   */
  static async validateModel(spec: ModelSpec): Promise<ModelValidationResult> {
    const result: ModelValidationResult = {
      modelName: spec.name,
      exists: false,
      actualSize: 0,
      withinSizeLimit: false,
      loadable: false,
      errors: [],
    };

    try {
      // Construct full file path
      const fullPath = this.getModelPath(spec.path);

      console.log(`[ModelValidator] Validating ${spec.name} at ${fullPath}...`);

      // Check if file exists
      const exists = await RNFS.exists(fullPath);
      result.exists = exists;

      if (!exists) {
        result.errors.push(`Model file not found at ${fullPath}`);
        return result;
      }

      // Check file size
      const stat = await RNFS.stat(fullPath);
      result.actualSize = parseInt(stat.size, 10);

      console.log(
        `[ModelValidator] ${spec.name} size: ${this.formatBytes(result.actualSize)} (expected: ${this.formatBytes(spec.expectedSize)}, max: ${this.formatBytes(spec.maxSize)})`,
      );

      if (result.actualSize > spec.maxSize) {
        result.errors.push(
          `File size ${this.formatBytes(result.actualSize)} exceeds maximum ${this.formatBytes(spec.maxSize)}`,
        );
      } else {
        result.withinSizeLimit = true;
      }

      // Test model loading
      result.loadable = await this.testModelLoading(spec.path);

      if (!result.loadable) {
        result.errors.push('Failed to load model with TFLite runtime');
      }
    } catch (error) {
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Test if model can be loaded by TFLite runtime
   */
  static async testModelLoading(modelPath: string): Promise<boolean> {
    try {
      console.log(`[ModelValidator] Testing model loading: ${modelPath}...`);
      
      // Try to load model
      const model = await loadTensorflowModel(modelPath);
      
      // If we got here, model loaded successfully
      console.log(`[ModelValidator] Model loaded successfully`);
      return true;
    } catch (error) {
      console.error(`[ModelValidator] Model loading failed:`, error);
      return false;
    }
  }

  /**
   * Get total model bundle size
   */
  static async getTotalModelSize(): Promise<number> {
    let totalSize = 0;

    for (const spec of this.MODEL_SPECS) {
      try {
        const fullPath = this.getModelPath(spec.path);
        const exists = await RNFS.exists(fullPath);
        
        if (exists) {
          const stat = await RNFS.stat(fullPath);
          totalSize += parseInt(stat.size, 10);
        }
      } catch {
        // Skip if file doesn't exist or can't be read
      }
    }

    return totalSize;
  }

  /**
   * Get full model file path based on platform
   */
  private static getModelPath(relativePath: string): string {
    if (Platform.OS === 'android') {
      // Android asset path
      return `${RNFS.MainBundlePath}/${relativePath}`;
    } else {
      // iOS bundle path
      return `${RNFS.MainBundlePath}/${relativePath}`;
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Generate text report for console/logs
   */
  static generateTextReport(report: ValidationReport): string {
    const lines: string[] = [];

    lines.push('╔═══════════════════════════════════════════════════════╗');
    lines.push('║        NHAI FaceAuth Model Validation Report         ║');
    lines.push('╚═══════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Timestamp: ${report.timestamp}`);
    lines.push(`Overall Status: ${report.allValid ? '✅ PASS' : '❌ FAIL'}`);
    lines.push(`Total Bundle Size: ${this.formatBytes(report.totalSize)} / ${this.formatBytes(this.TARGET_TOTAL_SIZE)} (target)`);
    lines.push('');
    lines.push('─────────────────────────────────────────────────────────');
    lines.push('Individual Model Results:');
    lines.push('─────────────────────────────────────────────────────────');

    report.models.forEach((model, index) => {
      lines.push('');
      lines.push(`${index + 1}. ${model.modelName}`);
      lines.push(`   • Exists: ${model.exists ? '✅' : '❌'}`);
      
      if (model.exists) {
        lines.push(`   • Size: ${this.formatBytes(model.actualSize)}`);
        lines.push(`   • Within Limit: ${model.withinSizeLimit ? '✅' : '❌'}`);
        lines.push(`   • Loadable: ${model.loadable ? '✅' : '❌'}`);
      }

      if (model.errors.length > 0) {
        lines.push('   • Errors:');
        model.errors.forEach(err => {
          lines.push(`     - ${err}`);
        });
      }
    });

    if (report.errors.length > 0) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────');
      lines.push('Critical Errors:');
      lines.push('─────────────────────────────────────────────────────────');
      report.errors.forEach(err => {
        lines.push(`❌ ${err}`);
      });
    }

    if (report.warnings.length > 0) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────');
      lines.push('Warnings:');
      lines.push('─────────────────────────────────────────────────────────');
      report.warnings.forEach(warn => {
        lines.push(`⚠️  ${warn}`);
      });
    }

    lines.push('');
    lines.push('═════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Get model specifications (for documentation)
   */
  static getModelSpecs(): ModelSpec[] {
    return [...this.MODEL_SPECS];
  }
}
