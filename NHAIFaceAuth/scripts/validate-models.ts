#!/usr/bin/env node
/**
 * Model Validation CLI Script
 * Run: npm run validate:models
 */

import { ModelValidator } from '../src/validation/ModelValidator';

async function main() {
  console.log('🔍 NHAI FaceAuth Model Validator\n');

  try {
    const report = await ModelValidator.validateAllModels();
    const textReport = ModelValidator.generateTextReport(report);
    
    console.log(textReport);
    
    process.exit(report.allValid ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

main();
