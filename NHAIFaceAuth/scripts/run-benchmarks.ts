#!/usr/bin/env node
/**
 * Benchmark Runner CLI Script
 * Run: npm run benchmark
 */

import { BenchmarkRunner } from '../src/benchmarking/BenchmarkRunner';
import * as fs from 'fs';

async function main() {
  console.log('⚡ NHAI FaceAuth Performance Benchmark\n');

  try {
    const report = await BenchmarkRunner.runBenchmarks({
      iterations: 100,
      warmupIterations: 10,
    });

    const mdReport = BenchmarkRunner.generateMarkdownReport(report);
    
    // Save to file
    fs.writeFileSync('benchmark-report.md', mdReport);
    
    console.log('✅ Benchmark complete!');
    console.log(`📊 Total Pipeline Latency: ${report.summary.totalPipelineLatency.toFixed(0)}ms`);
    console.log(`🎯 Meets Requirement (<1000ms): ${report.summary.breakdown.meetsRequirement ? '✅ YES' : '❌ NO'}`);
    console.log(`📝 Report saved to: benchmark-report.md\n`);
    
    report.recommendations.forEach(rec => console.log(rec));
    
    process.exit(report.summary.breakdown.meetsRequirement ? 0 : 1);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();
