export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { validateSessionSecret } = await import('@/lib/auth/session-key');
    const { validateAppOrigin } = await import('@/lib/auth/request');
    validateSessionSecret();
    validateAppOrigin();
  }
}
