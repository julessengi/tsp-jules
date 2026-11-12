module.exports = {
  forbidden: [
    {
      name: 'no-probability-to-execution',
      comment: 'Probability Engine must not import or depend on the execution boundary.',
      severity: 'error',
      from: { path: 'probability-engine.ts' },
      to: { path: 'executor.ts' },
    },
    {
      name: 'no-executor-direct-proposal',
      comment: 'Executor must only consume AuthorizedExecution tokens, never raw probability proposals.',
      severity: 'error',
      from: { path: 'executor.ts' },
      to: { path: 'probability-engine.ts' },
    },
    {
      name: 'no-direct-execution-from-probability',
      comment: 'Probability proposals are not allowed to reach the execution boundary without the decision gate.',
      severity: 'error',
      from: { path: 'probability-engine.ts' },
      to: { path: 'decision-boundary.ts' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: ['node_modules', 'dist'],
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    metrics: false,
  },
};
