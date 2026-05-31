I will proceed with the following step-by-step plan to optimize the app while ensuring 100% stability. As you requested, I will work with complete honesty and professional care.

### Phase 1: Navigation Security (Immediate Fix)
*   **Goal**: Prevent the app from closing accidentally.
*   **Implementation**: Add a "Double Tap to Exit" system. When the back button is pressed once, a small message (Toast) will appear saying "Press again to exit". The app will only close if pressed twice within 2 seconds.
*   **Safety**: This is a UI-level change and has zero risk of data loss.

### Phase 2: App Size Reduction (Optimization)
*   **Goal**: Reduce the 209MB size significantly.
*   **Implementation**: 
    *   Scan `src/assets` for images larger than 500KB.
    *   Compress these images using professional tools (converting to WebP where possible).
    *   Remove any unused or duplicate assets identified during the scan.
*   **Safety**: I will only optimize images, not delete code. The app will look the same but download faster.

### Phase 3: Performance & Lag Fix (Deep Scan)
*   **Goal**: Remove "lag" and "heating" issues.
*   **Implementation**:
    *   Audit all Supabase Realtime subscriptions.
    *   Ensure that when a user leaves a page (like a Live Room or Chat), the connection is 100% closed immediately.
    *   Reduce the frequency of data updates for non-critical features (like gift animations or viewer counts) to save CPU power.
*   **Safety**: Each change will be tested to ensure data remains "Instant" and "Real-time" as it should be in a professional app.

### Phase 4: Call Notification Logic
*   **Goal**: Ensure calls are visible even when the screen is off or the app is in the background.
*   **Implementation**: Review the Native bridge configuration for incoming calls to ensure the wake-lock and notification priority are set to 'Max'.

### Technical Details (For the record)
*   Modifying `src/App.tsx` for back-handler logic.
*   Optimizing assets in `src/assets/`.
*   Refactoring hooks in `src/hooks/` related to subscriptions.

I will start with **Phase 1** immediately after you confirm. I will not break any existing systems.