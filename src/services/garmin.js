/**
 * Garmin Connect Integration Service
 * 
 * IMPORTANT ARCHITECTURAL NOTE:
 * Garmin's official API (Health API & Activity API) requires:
 *   - Business developer program approval
 *   - Server-side OAuth (not SPA-compatible)
 *   - Push-based architecture (Garmin pushes to your server)
 * 
 * For a GitHub Pages SPA, direct Garmin API access is NOT possible.
 * 
 * Instead, this module provides TWO integration paths:
 * 
 * 1. PRIMARY: Via Intervals.icu (recommended)
 *    - Connect Garmin to Intervals.icu (free, native support)
 *    - All Garmin activities + wellness data flows through Intervals.icu API
 *    - This is the most reliable path for a personal coaching app
 * 
 * 2. SECONDARY: Manual FIT file upload
 *    - User exports FIT files from Garmin Connect web
 *    - Uploads directly to Coach Center for parsing
 *    - Useful for historical data or specific file analysis
 * 
 * 3. FUTURE: If you deploy a backend, you could use:
 *    - python-garminconnect library (unofficial, session-based)
 *    - Garmin Health SDK (requires business approval)
 */

class GarminService {
  constructor() {
    this.integrationMode = 'intervals'; // 'intervals' | 'manual' | 'direct'
  }

  configure(mode = 'intervals') {
    this.integrationMode = mode;
  }

  isConfigured() {
    // Garmin is "configured" if Intervals.icu is configured (bridge mode)
    return this.integrationMode === 'intervals';
  }

  getStatusMessage() {
    switch (this.integrationMode) {
      case 'intervals':
        return 'Garmin data flows via Intervals.icu sync. Ensure Garmin Connect is linked in your Intervals.icu settings.';
      case 'manual':
        return 'Manual mode: Upload .FIT files exported from Garmin Connect.';
      case 'direct':
        return 'Direct Garmin API requires a backend server. Not available in GitHub Pages mode.';
      default:
        return 'Not configured.';
    }
  }

  // ─── FIT File Parsing (for manual uploads) ────────────────
  // FIT files are binary. For full parsing, we'd need a FIT SDK.
  // For now, we accept FIT files and note this as a future module.
  async parseFitFile(file) {
    // TODO: Integrate fit-file-parser or garmin-fit-sdk
    // For v1, we document this as a planned feature
    return {
      status: 'pending',
      message: 'FIT file parsing is a planned module. For now, connect Garmin to Intervals.icu for automatic data flow.',
      fileName: file.name,
      fileSize: file.size,
    };
  }

  // ─── Garmin-specific metrics that flow through Intervals.icu ─
  // These are fields you'll find in Intervals.icu wellness data
  // when Garmin Connect is linked:
  static GARMIN_WELLNESS_FIELDS = [
    'restingHR',        // Resting heart rate from Garmin
    'hrv',              // HRV (if device supports)
    'weight',           // From Garmin Index scale or manual
    'sleepSecs',        // Total sleep duration
    'sleepScore',       // Garmin sleep score
    'steps',            // Daily steps
    'respiration',      // Avg respiration rate
    'spo2',             // Blood oxygen (if available)
    'bodyBattery',      // Garmin Body Battery (not standard in I.icu)
  ];

  // Garmin-specific activity fields in Intervals.icu:
  static GARMIN_ACTIVITY_FIELDS = [
    'average_hr',
    'max_hr',
    'average_cadence',
    'average_speed',
    'total_elevation_gain',
    'calories',
    'training_effect',     // Garmin Training Effect (aerobic)
    'anaerobic_training_effect',
  ];
}

export const garminService = new GarminService();
export default GarminService;
